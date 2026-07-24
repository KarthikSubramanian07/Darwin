import React from "react";
import ReactDOM from "react-dom/client";
import LaneDApp from "./LaneDApp";
import "./lane-d.css";

// Darwin run dashboard, its own Vite entry (app.html) rather than a route inside the landing
// app: the two share class names (.app) and design tokens, so a single bundle would let one
// stylesheet silently restyle the other.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LaneDApp />
  </React.StrictMode>,
);
