"use client";

import { useRef, useState } from "react";

const THRESHOLD = 80; // px to trigger delete

export function SwipeRow({
  children,
  onDelete,
  label = "Verwijder",
}: {
  children: React.ReactNode;
  onDelete: () => void;
  label?: string;
}) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef<"h" | "v" | null>(null);

  const reset = () => {
    setAnimating(true);
    setDx(0);
    setTimeout(() => setAnimating(false), 200);
  };

  return (
    <div className="relative overflow-hidden">
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-end pr-5 text-white font-semibold transition-colors ${
          dx < -THRESHOLD ? "bg-red-600" : "bg-red-500"
        }`}
        style={{ width: Math.max(0, -dx) + "px", minWidth: dx < 0 ? "60px" : "0" }}
      >
        {dx < -20 && <span>{label}</span>}
      </div>
      <div
        className="bg-white relative touch-pan-y"
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating ? "transform .2s ease-out" : "none",
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY };
          locked.current = null;
          setAnimating(false);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const ddx = e.clientX - start.current.x;
          const ddy = e.clientY - start.current.y;
          if (locked.current === null) {
            if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
            locked.current = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
          }
          if (locked.current === "h") {
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
            setDx(Math.min(0, ddx));
          }
        }}
        onPointerUp={() => {
          const wasH = locked.current === "h";
          start.current = null;
          locked.current = null;
          if (!wasH) return;
          if (dx < -THRESHOLD) {
            setAnimating(true);
            setDx(-400);
            setTimeout(onDelete, 180);
          } else {
            reset();
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          locked.current = null;
          reset();
        }}
      >
        {children}
      </div>
    </div>
  );
}
