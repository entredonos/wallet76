import React, { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";

// Pull-to-refresh estilo app nativa: no TOPO da página, puxar para baixo além
// de um limiar recarrega. Só em dispositivos de TOQUE (pointer: coarse) — não
// mexe no rato/desktop. Sem dependências externas.
const THRESHOLD = 70;   // px de puxão para disparar
const MAX_PULL = 110;   // limite visual do puxão

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);          // distância atual (px) — só para render
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const startY = useRef(null);
  const active = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const isTouch =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;

    const setP = (v) => {
      pullRef.current = v;
      setPull(v);
    };

    const onStart = (e) => {
      if (refreshingRef.current) return;
      if (window.scrollY > 0) { active.current = false; return; }
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e) => {
      if (!active.current || refreshingRef.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) { setP(0); return; }
      const dist = Math.min(MAX_PULL, dy * 0.5); // resistência
      setP(dist);
      if (dist > 5 && e.cancelable) e.preventDefault(); // trava o overscroll nativo enquanto puxa
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setP(THRESHOLD);
        setTimeout(() => { window.location.reload(); }, 450);
      } else {
        setP(0);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (pull <= 0 && !refreshing) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div
      className="md:hidden fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{
        top: "calc(env(safe-area-inset-top) + 8px)",
        transform: `translateY(${Math.max(0, pull - 20)}px)`,
        transition: active.current ? "none" : "transform 0.2s ease",
      }}
    >
      <div className="w-9 h-9 rounded-full bg-zinc-900/90 border border-zinc-700 flex items-center justify-center shadow-lg">
        <RotateCw
          className={`w-4 h-4 text-zinc-200 ${refreshing ? "animate-spin" : ""}`}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            opacity: 0.4 + progress * 0.6,
          }}
        />
      </div>
    </div>
  );
}
