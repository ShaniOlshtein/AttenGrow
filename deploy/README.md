# פריסה לענן (מטלה 4)

**התוצאה:** `https://<הדומיין>` → Load Balancer של גוגל עם HTTPS. ה-Load Balancer מעביר את `/api/*` ואת `/health` ל-Cloud Run `attengrow-server`, וכל השאר ל-Cloud Run `attengrow-client`. מסד הנתונים הוא MongoDB Atlas, והסודות שמורים ב-Secret Manager.

**האימג'ים** כבר נמצאים ב-Docker Hub (ציבוריים, linux/amd64), ולא צריך לבנות כלום:
- `ahuvafogel/attengrow-server:1.3`
- `ahuvafogel/attengrow-client:1.3`

הסקריפט `deploy/deploy.sh` מבצע את כל השלבים בענן. לפניו צריך לעשות ידנית את שלבים 1–4. אפשר להריץ אותו שוב כמה פעמים שרוצים: מה שכבר קיים נשאר, ומה שהשתנה מתעדכן.

---

## 1. Google Cloud
1. בקונסולה (console.cloud.google.com) יוצרים פרויקט ורושמים את ה-**Project ID**.
2. **Billing → Budgets & alerts**: יוצרים תקציב (למשל 5$) עם התראות במייל. **לא משדרגים את ה-Free Trial.**
3. מתקינים את [gcloud CLI](https://cloud.google.com/sdk/docs/install), ואז:
   ```bash
   gcloud auth login
   ```
   על Windows מריצים את הסקריפט מתוך **Git Bash** או מתוך Cloud Shell. Cloud Shell הכי פשוט: בו `gcloud` כבר מותקן ומחובר. מעלים אליו את התיקייה עם `git clone`.

## 2. MongoDB Atlas (חינם)
1. ב-cloud.mongodb.com יוצרים Cluster מסוג **M0 Free**, באזור קרוב (למשל Belgium / europe-west1).
2. ב-**Database Access** יוצרים משתמש עם **סיסמה חזקה וארוכה** (רצוי אקראית) והרשאת `readWrite`.
3. ב-**Network Access** מוסיפים `0.0.0.0/0`. ל-Cloud Run אין כתובת IP יציאה קבועה, ולכן אין כתובת מסוימת שאפשר לאשר. ההגנה כאן היא המשתמש והסיסמה החזקה, והחיבור תמיד מוצפן ב-TLS (ההסבר ב-EXPLAIN.md).
4. **Connect → Drivers** מעתיקים את מחרוזת החיבור:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

## 3. שמירת הסוד ב-Secret Manager (לא בקוד ולא ב-git)
```bash
gcloud config set project <PROJECT_ID>
gcloud services enable secretmanager.googleapis.com
gcloud secrets create mongodb-uri --replication-policy=automatic
printf '%s' 'mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority' \
  | gcloud secrets versions add mongodb-uri --data-file=-
```
את `jwt-secret` הסקריפט יוצר לבד, עם ערך אקראי.

## 4. דומיין ב-No-IP
1. ב-noip.com יוצרים Hostname חינמי, למשל `attengrow.ddns.net`.
2. את רשומת ה-A מעדכנים **אחרי** שהסקריפט מדפיס את ה-IP של ה-Load Balancer (שלב 5).
3. ⚠️ No-IP שולחים מייל אישור **כל 30 יום**. חייבים ללחוץ עליו, אחרת הדומיין נמחק.

## 5. הרצת הסקריפט
```bash
git clone https://github.com/ShaniOlshtein/AttenGrow.git
cd AttenGrow
GCP_PROJECT_ID=<PROJECT_ID> DOMAIN=attengrow.ddns.net bash deploy/deploy.sh
```
בסוף הסקריפט מדפיס:
- **Load Balancer IP**: אותו מכניסים ב-No-IP כרשומת A, וזו הרשומה **היחידה**.
- סטטוס התעודה: `PROVISIONING` זה תקין. התעודה מוכנה (`ACTIVE`) עד בערך 60 דקות **אחרי** שה-DNS מצביע על ה-IP.
- הקובץ `ahuva-shani-michal.json` לתיבת ההגשה. השם שלו זהה ל-`project`.

כך בודקים את סטטוס התעודה:
```bash
gcloud compute ssl-certificates list --format="table(name,managed.status,managed.domainStatus)"
```

## 6. בדיקה (מה שהבודק יבדוק)
- `https://<DOMAIN>` נפתח עם מנעול ירוק.
- `https://<DOMAIN>/health` מחזיר `{"status":"ok"}`.
- עובדים: הרשמה, התחברות, הוספת תוכן, סשן עם מצלמה (המצלמה עובדת רק ב-HTTPS).
- הנתונים נשמרים אחרי רענון ואחרי יציאה וכניסה מחדש.

## 7. עדכון קובץ ההגשה של מטלה 3 עם הדומיין
```bash
python deliver/make_zip.py https://attengrow.ddns.net
```
הפקודה בונה מחדש את `assignment3.zip`, והדומיין מופיע ב-`setup_notes` של PROJECT_INFO.

---

### תקלות נפוצות
| תסמין | פתרון |
|---|---|
| `mongodb-uri has no value yet` | לא בוצע שלב 3 |
| שגיאת 502 או "no healthy upstream" בדקות הראשונות | זה רגיל, ה-LB מתעדכן. מחכים 5–10 דקות |
| התעודה תקועה ב-`FAILED_NOT_VISIBLE` | ה-A record לא מצביע על ה-IP הנכון, או שיש עוד רשומות. מתקנים ב-No-IP ומחכים |
| `/api/...` מחזיר שגיאת 500, ובלוג יש `ServerSelectionTimeoutError` | ב-Atlas חסר `0.0.0.0/0` ב-Network Access, או שהסיסמה במחרוזת שגויה. אם בסיסמה יש תווים כמו `@` או `/`, צריך לקודד אותם (URL-encode) |
| `--allow-unauthenticated` נכשל | בפרויקט ארגוני יש מדיניות שחוסמת גישה ציבורית. משתמשים בחשבון פרטי |

לוגים של השרת:
```bash
gcloud run services logs read attengrow-server --region europe-west1 --limit 50
```

### עדכון גרסה בעתיד
בונים ודוחפים אימג' חדש (`docker buildx build --platform linux/amd64 -t ahuvafogel/attengrow-server:1.4 --push ./server`), ואז מריצים שוב:
```bash
IMAGE_TAG=1.4 GCP_PROJECT_ID=... DOMAIN=... bash deploy/deploy.sh
```
