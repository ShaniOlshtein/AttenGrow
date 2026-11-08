import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Species } from "../bloom/Plant";
import { useTween } from "../bloom/useTween";
import { useFlash } from "../hooks/useFlash";
import { LOW_SCORE } from "../lib/score";
import { KEYS, storage } from "../lib/storage";
import type { Growth } from "../types";
import { EngineStatus, FocusEngine, listCameras, Prediction, preloadModels } from "./engine";
import { BREAK_SECONDS, plantMood, SessionPhase } from "./focusLogic";
import { useCountdown, useThirsty } from "./focusHooks";
import { isMeasuring, Playback, PLAYBACK_TEXT, PlaybackEvent, TAB_HIDDEN_TEXT } from "./playback";
import { BreakBox, CameraControls, EndSummary, PlantStage, SessionIntro } from "./SessionParts";
import { ConsentDialog, ScoreChart, ScoreMeter } from "./widgets";

const STATUS_TEXT: Record<EngineStatus, string> = {
  loading: "מפעילים מצלמה וטוענים את המודל…",
  warming: "אוספים 10 שניות ראשונות של נתונים…",
  tracking: "מודדים ריכוז",
  noface: "לא זוהו פנים",
  error: "שגיאה",
  stopped: "המדידה הופסקה",
};
const ZERO: Growth = { level: 0, level_exact: 0, progress: 0, next_level_in: null, stage: "seed", blooms: 0, focused_seconds: 0 };
const GREW_FLASH_MS = 900;
const PLANT_GLIDE_MS = 2500; // readings arrive ~3 s apart: glide smoothly between them
const LIVE_POINTS = 60;

export type FocusHooks = {
  getPosition: () => number;
  pause?: () => void; // YouTube only
  isPlaying?: () => boolean; // YouTube only: is the video playing right now
  onUpdate?: (u: { score: number | null; status: EngineStatus; growth: Growth; onBreak: boolean }) => void;
};

export default function FocusPanel(props: {
  contentId: string;
  species: Species;
  hooks: FocusHooks;
  roomCode?: string | null;
  onSession?: (id: string | null) => void;
  /** video content only: the playback state machine (null = text/web, always measurable) */
  playback?: Playback | null;
  onPlayback?: (e: PlaybackEvent) => void;
  /** the player can't report play/pause (YouTube API blocked): the user reports it */
  manualPlayback?: boolean;
}) {
  const { contentId, species, hooks, roomCode, playback, onPlayback, manualPlayback } = props;
  const measuring = !playback || isMeasuring(playback);
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [summary, setSummary] = useState<EndSummary | null>(null);
  const [growth, setGrowth] = useState<Growth>(ZERO);
  const [autoPause, setAutoPause] = useState(() => storage.get(KEYS.autoPause) === "1");
  const [busy, setBusy] = useState(false);
  const [grew, flashGrew] = useFlash(GREW_FLASH_MS, false);
  const [breakLeft, setBreakLeft] = useCountdown(phase === "break");
  const thirst = useThirsty();

  const engine = useRef<FocusEngine | null>(null);
  const sessionId = useRef<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const bloomsSeen = useRef(0);
  const lastLevel = useRef(0); // level_exact of the last growth update (to flash "grew")
  const starting = useRef(false); // guards against double clicks
  const ending = useRef(false);
  const serverPlaying = useRef(true); // what the server was last told for this session
  const serverQueue = useRef<Promise<unknown>>(Promise.resolve());
  // engine callbacks are created once per engine: they read the latest props/state from here
  const live = useRef({ hooks, autoPause, measuring });
  live.current = { hooks, autoPause, measuring };

  const tellServer = (id: string, playing: boolean) => {
    if (serverPlaying.current === playing) return;
    serverPlaying.current = playing;
    const path = `/api/sessions/${id}/${playing ? "resume" : "pause"}`;
    serverQueue.current = serverQueue.current.then(() => api(path, { method: "POST" }).catch(() => {}));
  };

  // measurement + growth follow the playback state: pause the engine and tell the server
  useEffect(() => {
    engine.current?.setActive(measuring);
    if (!measuring) {
      thirst.pauseClock(); // paused time never counts towards "thirsty"
      setScore(null);
    }
    if (sessionId.current) tellServer(sessionId.current, measuring);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a measuring change
  }, [measuring]);

  // tell the parent (and the study room) what is happening
  useEffect(() => {
    hooks.onUpdate?.({ score, status, growth, onBreak: phase === "break" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hooks is a new object on every parent render
  }, [score, status, growth, phase]);

  useEffect(() => {
    const t = window.setTimeout(() => preloadModels().catch(() => {}), 300);
    return () => clearTimeout(t);
  }, []);

  const endOnServer = async () => {
    const id = sessionId.current;
    sessionId.current = null;
    props.onSession?.(null);
    if (!id) return null;
    return api<EndSummary>(`/api/sessions/${id}/end`, { method: "POST" });
  };

  useEffect(
    () => () => {
      engine.current?.stop();
      endOnServer().catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on unmount only
    [],
  );

  const applyGrowth = (g: Growth) => {
    if (g.level_exact > lastLevel.current + 1e-3) flashGrew(true);
    lastLevel.current = g.level_exact;
    setGrowth(g);
    if (g.blooms > bloomsSeen.current) {
      bloomsSeen.current = g.blooms;
      startBreak();
    }
  };

  const handlePrediction = (p: Prediction) => {
    if (!live.current.measuring) return; // video not playing: nothing is shown, sent or grown
    setScore(p.score);
    setHistory((h) => [...h.slice(-(LIVE_POINTS - 1)), p.score]);
    if (thirst.observe(p.score) === "thirsty" && live.current.autoPause) live.current.hooks.pause?.();
    const id = sessionId.current;
    if (!id) return;
    const position = Math.max(0, Math.round(live.current.hooks.getPosition() * 10) / 10);
    api<Growth>(`/api/sessions/${id}/readings`, {
      method: "POST",
      body: { position, score: Number(p.score.toFixed(4)), attention: p.attention?.slice(0, 100) ?? null },
    })
      .then(applyGrowth)
      .catch((err: ApiError) => {
        // a "paused" 409 can only be a reading that raced a pause - dropped on purpose
        if (err.code === "session_ended") setError(err.message);
      });
  };

  const startEngine = async (deviceId?: string) => {
    engine.current?.stop();
    const e = new FocusEngine({
      onStatus: (s, info) => {
        if (s === "stopped") return;
        setStatus(s);
        if (s === "noface") {
          setScore(null);
          thirst.pauseClock();
        }
        if (s === "error" && info) setError(info);
      },
      onPrediction: handlePrediction,
    });
    engine.current = e;
    e.setActive(live.current.measuring);
    preview.current?.replaceChildren(e.previewElement);
    await e.start(deviceId);
    const cams = await listCameras().catch(() => []);
    setCameras(cams);
    if (!deviceId) {
      const track = (e.previewElement.srcObject as MediaStream | null)?.getVideoTracks()[0];
      setCameraId(track?.getSettings().deviceId ?? cams[0]?.deviceId ?? "");
    }
  };

  const startBreak = () => {
    engine.current?.stop(); // camera off during the earned break
    engine.current = null;
    setScore(null);
    thirst.reset();
    setBreakLeft(BREAK_SECONDS);
    setPhase("break");
    live.current.hooks.pause?.();
  };

  const resume = async () => {
    setPhase("running");
    setStatus("loading");
    try {
      await startEngine(cameraId || undefined);
    } catch {
      /* status shows error */
    }
  };

  const agree = async () => {
    if (starting.current) return;
    starting.current = true;
    ending.current = false;
    setError("");
    setScore(null);
    setHistory([]);
    setSummary(null);
    setGrowth(ZERO);
    lastLevel.current = 0;
    thirst.reset();
    bloomsSeen.current = 0;
    setStatus("loading");
    setPhase("running");
    // video: the session starts "waiting for the video" unless it is already playing
    const playingNow = playback ? !manualPlayback && !!hooks.isPlaying?.() : true;
    onPlayback?.({ type: "SESSION_START", playing: playingNow });
    const playingForServer = playback ? playingNow && !document.hidden : true;
    try {
      const s = await api<{ id: string }>("/api/sessions", {
        method: "POST",
        body: { content_id: contentId, room_code: roomCode ?? null, playing: playingForServer },
      });
      sessionId.current = s.id;
      serverPlaying.current = playingForServer;
      tellServer(s.id, live.current.measuring); // the video may have started/stopped meanwhile
      props.onSession?.(s.id);
      await startEngine();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setStatus("error");
    } finally {
      starting.current = false;
    }
  };

  const end = async () => {
    if (ending.current) return;
    ending.current = true;
    setBusy(true);
    onPlayback?.({ type: "SESSION_END" });
    engine.current?.stop();
    engine.current = null;
    try {
      setSummary(await endOnServer());
      setPhase("ended");
    } catch (err) {
      setError((err as Error).message);
      ending.current = false;
    } finally {
      setBusy(false);
    }
  };

  const changeCamera = async (id: string) => {
    setCameraId(id);
    setScore(null);
    try {
      await startEngine(id);
    } catch {
      /* status shows the error */
    }
  };

  const changeAutoPause = (on: boolean) => {
    setAutoPause(on);
    storage.set(KEYS.autoPause, on ? "1" : "0");
  };

  const running = phase === "running" || phase === "break";
  const mood = running || phase === "ended" ? plantMood({ phase, measuring, status, score }) : "still";
  const plantLevel = useTween(phase === "ended" && summary ? summary.level_exact : growth.level_exact, PLANT_GLIDE_MS);

  return (
    <section className="card session" aria-label="סשן מדידה">
      {phase === "consent" && <ConsentDialog onAgree={agree} onDecline={() => setPhase("declined")} />}

      <PlantStage level={plantLevel} species={species} mood={mood} reviving={thirst.reviving || grew} growth={growth}
        showProgress={running} grew={grew} />

      {(phase === "idle" || phase === "declined" || phase === "ended") && (
        <SessionIntro phase={phase} summary={summary} onStart={() => setPhase("consent")} />
      )}

      {phase === "break" && <BreakBox secondsLeft={breakLeft} busy={busy} onResume={resume} onEnd={end} />}

      {phase === "running" && (
        <div className="stack">
          <div className="row between">
            <span className={`status-chip ${status}`} role="status" data-testid="engine-status">
              {!measuring && (status === "warming" || status === "tracking" || status === "noface") ? (
                "⏸ המדידה מושהית"
              ) : (
                <>
                  {status === "noface" ? "😴 " : ""}
                  {STATUS_TEXT[status]}
                </>
              )}
            </span>
            <button className="btn danger" onClick={end} disabled={busy}>
              {busy ? "מסיים…" : "סיים סשן"}
            </button>
          </div>
          {playback && !measuring && (
            <p className="alert warn" role="status" data-testid="playback-status" data-state={playback.state}>
              {playback.tabHidden && playback.state === "playing" ? TAB_HIDDEN_TEXT : PLAYBACK_TEXT[playback.state]}
            </p>
          )}
          {playback && manualPlayback && (
            <div className="alert warn stack" data-testid="manual-playback">
              <p>
                לא הצלחנו לזהות אוטומטית אם הסרטון מתנגן 🙈 כדי שנמדוד רק בזמן הצפייה: כשתתחילו את הסרטון לחצו על "התחלתי
                לצפות", וכשתעצרו אותו לחצו על "עצרתי" — והמדידה תיעצר גם היא.
              </p>
              <div className="row">
                <button className="btn" disabled={playback.state === "playing"} onClick={() => onPlayback?.({ type: "PLAY" })}>
                  ▶ התחלתי לצפות
                </button>
                <button className="btn ghost" disabled={playback.state !== "playing"} onClick={() => onPlayback?.({ type: "PAUSE" })}>
                  ⏸ עצרתי
                </button>
              </div>
            </div>
          )}
          {measuring && status === "noface" && (
            <p className="alert warn" role="alert">
              לא זוהו פנים — הצמח ישן עד שתחזרו מול המצלמה. שום דבר לא נשלח.
            </p>
          )}
          {thirst.thirsty && (
            <p className="alert thirsty" role="alert" data-testid="thirsty">
              הצמח שלך צמא לריכוז 🌱
            </p>
          )}
          {thirst.reviving && (
            <p className="alert ok" role="status">
              הצמח התעורר! 🌿
            </p>
          )}
          <ScoreMeter score={score} waitingText={measuring ? undefined : "המדידה מושהית"} />
          {score !== null && score < LOW_SCORE && !thirst.thirsty && (
            <p className="alert error" role="alert">
              הריכוז ירד — נסו לחזור לתוכן 🙂
            </p>
          )}
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <div className="cam-row">
            <div className="preview" ref={preview} aria-label="תצוגה מקדימה של המצלמה" />
            <CameraControls cameras={cameras} cameraId={cameraId} onCamera={changeCamera}
              autoPause={hooks.pause ? autoPause : null} onAutoPause={changeAutoPause} />
          </div>
          {history.length > 1 && <ScoreChart points={history} height={100} />}
        </div>
      )}
    </section>
  );
}
