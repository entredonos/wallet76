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
  win.loadURL("https://wallet76.com");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});