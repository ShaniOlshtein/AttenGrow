#!/usr/bin/env bash
# AttenGrow - Assignment 4: deploy to Google Cloud.
#   https://DOMAIN -> global external HTTPS Load Balancer
#        /api/*, /health -> Cloud Run "attengrow-server" (FastAPI, port 8000)
#        everything else -> Cloud Run "attengrow-client" (nginx + React build, port 3000)
#   DB = MongoDB Atlas M0, secrets in Secret Manager.
# Idempotent: safe to run again (existing resources are kept / updated).
# Usage:  GCP_PROJECT_ID=my-project DOMAIN=attengrow.ddns.net bash deploy/deploy.sh
# Manual steps before running (Atlas, No-IP, secret values): see deploy/README.md
set -euo pipefail

# ---------------- variables ----------------
GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"           # e.g. attengrow-123456
REGION="${REGION:-europe-west1}"
DOMAIN="${DOMAIN:-}"                           # e.g. attengrow.ddns.net (No-IP hostname, no https://)
IMAGE_TAG="${IMAGE_TAG:-1.3}"
SERVER_IMAGE="${SERVER_IMAGE:-docker.io/ahuvafogel/attengrow-server:${IMAGE_TAG}}"
CLIENT_IMAGE="${CLIENT_IMAGE:-docker.io/ahuvafogel/attengrow-client:${IMAGE_TAG}}"
DB_NAME="${DB_NAME:-focusflow}"
TEAM_ID="${TEAM_ID:-ahuva-shani-michal}"
MEMBERS_JSON='["Shani Olshtein", "Michal David", "Ahuva Fogel"]'

SERVER_SVC=attengrow-server
CLIENT_SVC=attengrow-client
RUN_SA_NAME=attengrow-run
IP_NAME=attengrow-ip
URLMAP=attengrow-urlmap
REDIRECT_URLMAP=attengrow-http-redirect
HTTPS_PROXY=attengrow-https-proxy
HTTP_PROXY=attengrow-http-proxy
FR_HTTPS=attengrow-https-fr
FR_HTTP=attengrow-http-fr
# ---------------------------------------------

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }
exists() { "$@" >/dev/null 2>&1; }

[ -n "$GCP_PROJECT_ID" ] || die "set GCP_PROJECT_ID (the project id from the GCP console)"
[ -n "$DOMAIN" ] || die "set DOMAIN (your No-IP hostname, e.g. attengrow.ddns.net)"
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
command -v gcloud >/dev/null || die "gcloud CLI is not installed"
gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q . || die "run: gcloud auth login"

gcloud config set project "$GCP_PROJECT_ID" >/dev/null
gcloud config set run/region "$REGION" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format="value(projectNumber)")
RUN_SA="${RUN_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

step "Enabling APIs (run, compute, secretmanager)"
gcloud services enable run.googleapis.com compute.googleapis.com secretmanager.googleapis.com

step "Secrets in Secret Manager"
for s in mongodb-uri jwt-secret gemini-api-key; do
  exists gcloud secrets describe "$s" || gcloud secrets create "$s" --replication-policy=automatic
done
if ! exists gcloud secrets versions access latest --secret=jwt-secret; then
  echo "    jwt-secret has no value - generating a random one (it is never printed or saved locally)"
  openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add jwt-secret --data-file=-
fi
exists gcloud secrets versions access latest --secret=mongodb-uri || die "mongodb-uri has no value yet.
  Add the Atlas connection string (see deploy/README.md step 3):
    printf '%s' 'mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority' | gcloud secrets versions add mongodb-uri --data-file=-"

step "Service account for Cloud Run + secretAccessor"
exists gcloud iam service-accounts describe "$RUN_SA" || \
  gcloud iam service-accounts create "$RUN_SA_NAME" --display-name="AttenGrow Cloud Run runtime"
for s in mongodb-uri jwt-secret gemini-api-key; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:${RUN_SA}" \
    --role=roles/secretmanager.secretAccessor --condition=None >/dev/null
done

step "Cloud Run: $SERVER_SVC  ($SERVER_IMAGE)"
# ingress: only the Load Balancer may reach the API (the run.app URL is closed to the internet)
gcloud run deploy "$SERVER_SVC" --image="$SERVER_IMAGE" --region="$REGION" --port=8000 \
  --service-account="$RUN_SA" --allow-unauthenticated \
  --ingress=internal-and-cloud-load-balancing \
  --min-instances=0 --max-instances=3 --cpu=1 --memory=512Mi \
  --set-secrets="MONGODB_URI=mongodb-uri:latest,JWT_SECRET=jwt-secret:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --set-env-vars="DB_NAME=${DB_NAME},CORS_ORIGINS=https://${DOMAIN}" --quiet
SERVER_URL=$(gcloud run services describe "$SERVER_SVC" --region="$REGION" --format="value(status.url)")

step "Cloud Run: $CLIENT_SVC  ($CLIENT_IMAGE)"
# ingress: only the Load Balancer may reach the client (mirrors the server restriction)
gcloud run deploy "$CLIENT_SVC" --image="$CLIENT_IMAGE" --region="$REGION" --port=3000 \
  --service-account="$RUN_SA" --allow-unauthenticated \
  --ingress=internal-and-cloud-load-balancing \
  --min-instances=0 --max-instances=3 --cpu=1 --memory=256Mi \
  --set-env-vars="BACKEND_URL=${SERVER_URL}" --quiet

step "Static global IP"
exists gcloud compute addresses describe "$IP_NAME" --global || \
  gcloud compute addresses create "$IP_NAME" --global --ip-version=IPV4
LB_IP=$(gcloud compute addresses describe "$IP_NAME" --global --format="value(address)")

step "Serverless NEGs + backend services"
for svc in "$SERVER_SVC" "$CLIENT_SVC"; do
  neg="${svc}-neg"; bs="${svc}-bs"
  exists gcloud compute network-endpoint-groups describe "$neg" --region="$REGION" || \
    gcloud compute network-endpoint-groups create "$neg" --region="$REGION" \
      --network-endpoint-type=serverless --cloud-run-service="$svc"
  exists gcloud compute backend-services describe "$bs" --global || \
    gcloud compute backend-services create "$bs" --global --load-balancing-scheme=EXTERNAL_MANAGED
  gcloud compute backend-services describe "$bs" --global --format="value(backends[].group)" | grep -q "/${neg}$" || \
    gcloud compute backend-services add-backend "$bs" --global \
      --network-endpoint-group="$neg" --network-endpoint-group-region="$REGION"
done

step "URL map: default -> client, /api/* and /health -> server"
BS_BASE="https://www.googleapis.com/compute/v1/projects/${GCP_PROJECT_ID}/global/backendServices"
URLMAP_FILE=$(mktemp)
cat > "$URLMAP_FILE" <<EOF
name: ${URLMAP}
defaultService: ${BS_BASE}/${CLIENT_SVC}-bs
hostRules:
- hosts: ['*']
  pathMatcher: attengrow-paths
pathMatchers:
- name: attengrow-paths
  defaultService: ${BS_BASE}/${CLIENT_SVC}-bs
  pathRules:
  - paths: ['/api/*', '/api', '/health']
    service: ${BS_BASE}/${SERVER_SVC}-bs
EOF
gcloud compute url-maps import "$URLMAP" --global --source="$URLMAP_FILE" --quiet
rm -f "$URLMAP_FILE"

step "Google-managed SSL certificate for $DOMAIN"
CERT="attengrow-cert-$(echo "$DOMAIN" | tr -c 'a-z0-9\n' '-' | cut -c1-50)"
exists gcloud compute ssl-certificates describe "$CERT" --global || \
  gcloud compute ssl-certificates create "$CERT" --global --domains="$DOMAIN"

step "HTTPS proxy + forwarding rule :443"
if exists gcloud compute target-https-proxies describe "$HTTPS_PROXY" --global; then
  gcloud compute target-https-proxies update "$HTTPS_PROXY" --global --url-map="$URLMAP" --ssl-certificates="$CERT"
else
  gcloud compute target-https-proxies create "$HTTPS_PROXY" --global --url-map="$URLMAP" --ssl-certificates="$CERT"
fi
exists gcloud compute forwarding-rules describe "$FR_HTTPS" --global || \
  gcloud compute forwarding-rules create "$FR_HTTPS" --global --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$IP_NAME" --target-https-proxy="$HTTPS_PROXY" --ports=443

step "HTTP :80 -> HTTPS redirect"
REDIRECT_FILE=$(mktemp)
cat > "$REDIRECT_FILE" <<EOF
name: ${REDIRECT_URLMAP}
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
EOF
gcloud compute url-maps import "$REDIRECT_URLMAP" --global --source="$REDIRECT_FILE" --quiet
rm -f "$REDIRECT_FILE"
exists gcloud compute target-http-proxies describe "$HTTP_PROXY" --global || \
  gcloud compute target-http-proxies create "$HTTP_PROXY" --global --url-map="$REDIRECT_URLMAP"
exists gcloud compute forwarding-rules describe "$FR_HTTP" --global || \
  gcloud compute forwarding-rules create "$FR_HTTP" --global --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$IP_NAME" --target-http-proxy="$HTTP_PROXY" --ports=80

step "Submission file ${TEAM_ID}.json"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
printf '{ "project": "%s", "domain": "https://%s", "members": %s }\n' "$TEAM_ID" "$DOMAIN" "$MEMBERS_JSON" \
  > "${ROOT_DIR}/${TEAM_ID}.json"
cat "${ROOT_DIR}/${TEAM_ID}.json"

CERT_STATUS=$(gcloud compute ssl-certificates describe "$CERT" --global --format="value(managed.status)")
cat <<EOF

============================================================
 Load Balancer IP : ${LB_IP}
 Domain           : https://${DOMAIN}
 Certificate      : ${CERT_STATUS}   (PROVISIONING is normal - up to ~60 min)

 Now (if not done yet): in No-IP point the A record of ${DOMAIN} to ${LB_IP} ONLY.
 Check:  nslookup ${DOMAIN}       -> ${LB_IP}
         curl -i https://${DOMAIN}/health   -> 200 {"status":"ok"}
============================================================
EOF
