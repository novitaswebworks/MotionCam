import React, { useRef } from "react";

interface TrimHandlesProps {
  durationMs: number;
  trimInMs: number;
  trimOutMs: number;
  onChangeTrim: (trimIn: number, trimOut: number) => void;
}

export const TrimHandles: React.FC<TrimHandlesProps> = ({
  durationMs,
  trimInMs,
  trimOutMs,
  onChangeTrim,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const inPct = durationMs > 0 ? (trimInMs / durationMs) * 100 : 0;
  const outPct = durationMs > 0 ? (trimOutMs / durationMs) * 100 : 100;

  const handleDragIn = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const initialIn = trimInMs;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = (deltaPx / rect.width) * durationMs;
      const newIn = Math.max(0, Math.min(initialIn + deltaMs, trimOutMs - 500));
      onChangeTrim(Math.round(newIn), trimOutMs);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleDragOut = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const initialOut = trimOutMs;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = (deltaPx / rect.width) * durationMs;
      const newOut = Math.min(durationMs, Math.max(initialOut + deltaMs, trimInMs + 500));
      onChangeTrim(trimInMs, Math.round(newOut));
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      {/* Left Trimmed Dead Zone */}
      {inPct > 0 && (
        <div
          className="absolute top-0 bottom-0 left-0 bg-zinc-950/70 backdrop-blur-[1px] border-r border-amber-500/80"
          style={{ width: `${inPct}%` }}
        />
      )}

      {/* Right Trimmed Dead Zone */}
      {outPct < 100 && (
        <div
          className="absolute top-0 bottom-0 right-0 bg-zinc-950/70 backdrop-blur-[1px] border-l border-amber-500/80"
          style={{ width: `${100 - outPct}%` }}
        />
      )}

      {/* Left Handle */}
      <div
        onMouseDown={handleDragIn}
        className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center bg-amber-500 hover:bg-amber-400 rounded-l shadow-md pointer-events-auto"
        style={{ left: `${inPct}%` }}
        title={`Trim In: ${(trimInMs / 1000).toFixed(1)}s`}
      >
        <div className="w-0.5 h-3 bg-zinc-950 rounded-full" />
      </div>

      {/* Right Handle */}
      <div
        onMouseDown={handleDragOut}
        className="absolute top-0 bottom-0 w-3 -mr-1.5 cursor-ew-resize flex items-center justify-center bg-amber-500 hover:bg-amber-400 rounded-r shadow-md pointer-events-auto"
        style={{ left: `${outPct}%` }}
        title={`Trim Out: ${(trimOutMs / 1000).toFixed(1)}s`}
      >
        <div className="w-0.5 h-3 bg-zinc-950 rounded-full" />
      </div>
    </div>
  );
};
