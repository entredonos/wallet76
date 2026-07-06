import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { register as registerSW } from "./serviceWorkerRegistration";
// Module-level import (not inside a component) so the `beforeinstallprompt`
// listener attaches before React even mounts — see lib/pwaInstall.js for why.
import "./lib/pwaInstall";

// Note: this app fetches data by hand (axios + useEffect) throughout, not
// via @tanstack/react-query or swr — both were installed and wrapped around
// the whole tree here but never actually used anywhere (no useQuery/useSWR
// calls found in the codebase), so the provider was doing nothing. Removed
// along with the two packages from package.json.
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA (offline support + installability)
registerSW();
