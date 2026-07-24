import React from "react";
import ReactDOM from "react-dom/client";
import LaneDApp from "./LaneDApp";
import { AuthProvider } from "./auth/AuthProvider";
import "./lane-d.css";

// Lane D's run dashboard is its own Vite entry (app.html) rather than a route inside the
// landing app: the two share class names (.app) and design tokens (--bg, --fg, --font-sans),
// so a single bundle would let one stylesheet silently restyle the other.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <LaneDApp />
    </AuthProvider>
  </React.StrictMode>,
);
