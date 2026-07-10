const { app, BrowserWindow } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: "Wallet76",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 10 jul 2026 — tinha "https://wallet76.vercel.app" aqui, mas o cookie de
  // sessão está preso ao domínio "wallet76.com" (ver COOKIE_DOMAIN em
  // backend/core.py, derivado de FRONTEND_URL). vercel.app e wallet76.com
  // são domínios diferentes, por isso o cookie do login nunca era enviado
  // nos pedidos seguintes aqui dentro — "sessão expirada" imediata, mesmo
  // sem nenhum problema de cross-site cookie de terceiros (isto é só
  // Electron a apontar para o domínio errado).
  //
  // Carrega "/login" e não a raiz "/" (10 jul 2026, 2ª parte): a rota "/" em
  // App.js só salta a landing page quando Capacitor.isNativePlatform() ou o
  // "display-mode: standalone" do PWA são verdadeiros — nenhum dos dois se
  // aplica a uma janela Electron normal, por isso o ícone do ambiente de
  // trabalho abria sempre a landing de marketing em vez de ir logo para o
  // login. "/login" já trata sozinho o caso de sessão ainda válida
  // (PublicOnly em App.js manda para /dashboard automaticamente).
  win.loadURL("https://wallet76.com/login");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});