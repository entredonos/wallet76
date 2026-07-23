import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import * as Sentry from "@sentry/react";
import { register as registerSW } from "./serviceWorkerRegistration";
// Module-level import (not inside a component) so the `beforeinstallprompt`
// listener attaches before React even mounts — see lib/pwaInstall.js for why.
import "./lib/pwaInstall";

// Note: this app fetches data by hand (axios + useEffect) throughout, not
// via @tanstack/react-query or swr — both were installed and wrapped around
// the whole tree here but never actually used anywhere (no useQuery/useSWR
// calls found in the codebase), so the provider was doing nothing. Removed
// along with the two packages from package.json.
// Monitorização de erros no frontend — só ativa se REACT_APP_SENTRY_DSN
// estiver definido (no Vercel). Sem a variável fica totalmente inerte, por
// isso é seguro em local. Não envia dados pessoais (sendDefaultPii=false).
if (process.env.REACT_APP_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA (offline support + installability)
registerSW();
