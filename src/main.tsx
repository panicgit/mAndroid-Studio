import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LogcatWindow from "./LogcatWindow";
import "./styles/das.css";

// Same bundle serves the main IDE and the detached Logcat window; route by query.
const view = new URLSearchParams(location.search).get("view");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  React.createElement(view === "logcat" ? LogcatWindow : App)
);
