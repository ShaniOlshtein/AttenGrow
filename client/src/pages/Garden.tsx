import { Link } from "react-router-dom";
import Plant, { FULL_BLOOM, Species, SPECIES_NAME, STAGE_NAME } from "../bloom/Plant";
import { Loading } from "../components/common";
import HistoryList from "../components/HistoryList";
import { useApi } from "../hooks/useApi";
import { flowerColor } from "../lib/score";
import { fmtDate } from "../lib/text";
import type { Season } from "../types";

export type GardenPlant = {
  session_id: string;
  title: string;
  species: Species;
  bed: string;
  started_at: string;
  average_score: number | null;
  focused_minutes: number;
  level: number;
  level_exact: number;
  stage: string;
  blooms: number;
};
type Bed = { name: string; plants: GardenPlant[]; focused_minutes: number; average_score: number | null };
type SharedPlant = { room_code: string; names: string[]; created_at: string };
type GardenData = { beds: Bed[]; total_plants: number; flowers: number; shared_plants: SharedPlant[]; season: Season };

export default function Garden() {
  const { data, error } = useApi<GardenData>(`/api/garden?tz_offset=${new Date().getTimezoneOffset()}`);
  const season = data?.season;

  return (
    <div className="stack">
      <section className={`card garden season-${season?.key ?? "none"}`}>
        <div className="garden-intro row between">
          <div>
            <p className="garden-kicker">הפינה הירוקה שלכם</p>
            <h1>הגינה שלי</h1>
            <p className="muted">כל סשן שהסתיים נשתל כאן. גובה = דקות ריכוז, צבע הפרח = ממוצע הריכוז.</p>
          </div>
          <div className="garden-weather" aria-hidden="true">
            ☀️<span>🌿</span>
          </div>
          {season && (
            <span className="season-chip">
              {season.emoji} עונת {season.name}
            </span>
          )}
        </div>
        {error && <p className="alert error">{error}</p>}
        {data === null ? (
          !error && <Loading />
        ) : data.total_plants === 0 ? (
          <p className="empty">הגינה עוד ריקה. פתחו תוכן מהספרייה, לחצו "התחל סשן" — והצמח הראשון יישתל כאן 🌱</p>
        ) : (
          <>
            <p className="garden-stats">
              🌱 {data.total_plants} צמחים · 🌼 {data.flowers} פרחו
            </p>
            {data.shared_plants.length > 0 && <SharedBed plants={data.shared_plants} />}
            {data.beds.map((b) => (
              <GardenBed key={b.name} bed={b} />
            ))}
          </>
        )}
      </section>
      <HistoryList />
    </div>
  );
}

function SharedBed({ plants }: { plants: SharedPlant[] }) {
  return (
    <div className="bed" aria-label="ערוגה משותפת">
      <div className="bed-head">
        <h2>🤝 פרחנו ביחד</h2>
      </div>
      <div className="bed-soil">
        {plants.map((p) => (
          <div key={p.room_code} className="garden-plant" title={p.names.join(" + ")}>
            <Plant level={FULL_BLOOM} species="sunflower" color="#f7a8c4" mood="grow" size={80} pot={false}
              label={`צמח משותף: ${p.names.join(" ו-")}`} />
            <span className="gp-title">{p.names.join(" + ")}</span>
            <span className="muted small">{fmtDate(p.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GardenBed({ bed }: { bed: Bed }) {
  return (
    <div className="bed" aria-label={`ערוגה ${bed.name}`}>
      <div className="bed-head">
        <h2>
          <span aria-hidden="true">🌱</span> {bed.name}
        </h2>
        <span className="muted small">
          {bed.focused_minutes} דק׳ מרוכזות · ממוצע {bed.average_score?.toFixed(2) ?? "—"}
        </span>
      </div>
      <div className="bed-soil">
        {bed.plants.map((p) => (
          <Link key={p.session_id} to={`/history/${p.session_id}`} className="garden-plant" title={`${p.title} · ${fmtDate(p.started_at)}`}>
            <Plant level={p.level_exact ?? p.level} species={p.species} color={flowerColor(p.average_score)} mood="still" pot={false}
              size={62 + Math.min(30, p.focused_minutes)} label={`${SPECIES_NAME[p.species]}: ${p.title}`} />
            <span className="gp-title">{p.title}</span>
            <span className="muted small">
              {STAGE_NAME[p.stage]} · {Math.round(p.focused_minutes)} דק׳{p.blooms > 1 ? ` · 🌼×${p.blooms}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
