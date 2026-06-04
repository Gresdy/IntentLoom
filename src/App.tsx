import { HashRouter } from "react-router-dom";
import { ReasonixApp } from "./ReasonixApp";
import "@unocss/reset/tailwind.css";
import "uno.css";
import "./styles/globals.css";

// HashRouter is the right fit for Tauri's file:// runtime: it keeps the
// protocol stable across platforms and supports deep links (e.g.
// `intentloom:///#/settings`) without touching the dev server.
export const App: React.FC = () => {
  return (
    <HashRouter>
      <ReasonixApp />
    </HashRouter>
  );
};

export default ReasonixApp;
