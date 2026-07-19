import { useEffect } from "react";

const ACTIVITY = ["pointerdown", "keydown", "touchstart"];

/**
 * Re-bloqueia a app (setUnlocked(false)) por inatividade e/ou quando a app
 * volta de segundo plano ou o ecrã se desliga. Só atua se houver bloqueio
 * configurado (PIN/biometria) — lê o modo em cache "w76-lock-mode", gravado
 * pelo LockScreen/Settings ao consultar /security/status.
 *
 * Preferências (definidas em Definições, guardadas em localStorage):
 *   w76-autolock-mins : minutos de inatividade até bloquear (0 = desligado; default 5)
 *   w76-autolock-bg   : "false" desliga o bloqueio ao sair/ecrã desligado (default ligado)
 */
export function useAutoLock(unlocked, setUnlocked) {
  useEffect(() => {
    if (!unlocked) return;
    let mode = null;
    try { mode = localStorage.getItem("w76-lock-mode"); } catch { /* noop */ }
    if (!mode || mode === "none") return; // sem bloqueio configurado → nada a fazer

    const mins = () => { try { const v = parseInt(localStorage.getItem("w76-autolock-mins"), 10); return Number.isNaN(v) ? 5 : v; } catch { return 5; } };
    const bgOn = () => { try { return localStorage.getItem("w76-autolock-bg") !== "false"; } catch { return true; } };

    let timer = null;
    let hiddenAt = 0;
    const relock = () => setUnlocked(false);
    const resetIdle = () => {
      if (timer) clearTimeout(timer);
      const m = mins();
      if (m > 0) timer = setTimeout(relock, m * 60 * 1000);
    };
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        // Voltou ao 1.º plano: se esteve escondida (ecrã desligado / app em
        // segundo plano) mais de 2s, re-bloqueia; a folga evita bloquear em
        // trocas de foco instantâneas (ex.: o próprio prompt de biometria).
        if (bgOn() && hiddenAt && Date.now() - hiddenAt > 2000) { relock(); return; }
        resetIdle();
      }
    };
    ACTIVITY.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    resetIdle();
    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, resetIdle));
      document.removeEventListener("visibilitychange", onVis);
      if (timer) clearTimeout(timer);
    };
  }, [unlocked, setUnlocked]);
}
