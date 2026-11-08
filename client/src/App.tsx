import { lazy, ReactNode, Suspense, useEffect } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { Logo, NotFound } from "./components/common";
import { KEYS, storage } from "./lib/storage";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";

// Logged-in screens load on demand: the watch screen pulls in MediaPipe + onnxruntime,
// which the landing / login pages never need.
const Library = lazy(() => import("./pages/Library"));
const ContentView = lazy(() => import("./pages/ContentView"));
const HistoryDetail = lazy(() => import("./pages/History").then((m) => ({ default: m.HistoryDetail })));
const Garden = lazy(() => import("./pages/Garden"));
const JournalPage = lazy(() => import("./pages/Journal"));
const Profile = lazy(() => import("./pages/Profile"));
const RoomJoin = lazy(() => import("./pages/RoomJoin"));

const Spinner = () => <div className="center muted">טוען…</div>;

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        <Logo />
        <nav className="mainnav" aria-label="ניווט ראשי">
          <NavLink to="/library">הספרייה</NavLink>
          <NavLink to="/history">הגינה שלי · היסטוריה</NavLink>
          <NavLink to="/journal">יומן הגינה</NavLink>
          <NavLink to="/profile">פרופיל</NavLink>
        </nav>
        <div className="userbox">
          <span className="hello" data-testid="display-name">
            שלום, {user?.display_name}
          </span>
          <button
            className="btn ghost"
            onClick={async () => {
              await logout();
              nav("/login", { replace: true });
            }}
          >
            התנתק
          </button>
        </div>
      </header>
      <main className="page">
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </main>
    </>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const here = loc.pathname + loc.search;
  const mustLogin = !loading && !user;
  useEffect(() => {
    if (mustLogin) storage.set(KEYS.returnTo, here, "session"); // come back here after login/registration
  }, [mustLogin, here]);
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: here }} />;
  return <Shell>{children}</Shell>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Navigate to="/library" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/library" element={<Protected><Library /></Protected>} />
      <Route path="/content/:id" element={<Protected><ContentView /></Protected>} />
      <Route path="/history" element={<Protected><Garden /></Protected>} />
      <Route path="/journal" element={<Protected><JournalPage /></Protected>} />
      <Route path="/history/:id" element={<Protected><HistoryDetail /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/room/:code" element={<Protected><RoomJoin /></Protected>} />
      <Route path="*" element={<Protected><NotFound /></Protected>} />
    </Routes>
  );
}
