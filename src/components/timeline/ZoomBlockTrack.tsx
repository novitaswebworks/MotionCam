import React, { useRef } from "react";
import { CameraKeyframe } from "../../lib/types";

interface ZoomBlockTrackProps {
  durationMs: number;
  keyframes: CameraKeyframe[];
  onUpdateKeyframe: (timeMs: number, updates: Partial<CameraKeyframe>) => void;
  onDeleteKeyframe: (timeMs: number) => void;
  onSelectKeyframe?: (kf: CameraKeyframe) => void;
  selectedTime?: number | null;
  onAddAtTime?: (timeMs: number) => void;
}

export const ZoomBlockTrack: React.FC<ZoomBlockTrackProps> = ({
  durationMs,
  keyframes,
  onUpdateKeyframe,
  onDeleteKeyframe,
  onSelectKeyframe,
  selectedTime = null,
  onAddAtTime,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  // Group keyframes into zoom blocks
  const zoomKeyframes = keyframes.filter((k) => k.zoom > 1.0);

  const startResizeLeft = (kf: CameraKeyframe, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const initialT = kf.t;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const deltaPx = moveEvt.clientX - startX;
      const deltaMs = (deltaPx / rect.width) * durationMs;
      const newT = Math.max(0, initialT + deltaMs);
      onUpdateKeyframe(initialT, { t: Math.round(newT) });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startResizeRight = (kf: CameraKeyframe, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const initialDuration = kf.duration_ms || 1000;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const deltaPx = moveEvt.clientX - startX;
      const deltaMs = (deltaPx / rect.width) * durationMs;
      const newDuration = Math.max(300, initialDuration + deltaMs);
      onUpdateKeyframe(kf.t, { duration_ms: Math.round(newDuration) });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div ref={trackRef} onDoubleClick={e => { if (!onAddAtTime || !trackRef.current) return; const r=trackRef.current.getBoundingClientRect(); onAddAtTime(Math.max(0,Math.min(durationMs,((e.clientX-r.left)/r.width)*durationMs))); }} title="Double-click the zoom track to add a zoom here" className="relative w-full h-7 bg-zinc-950/60 rounded border border-zinc-800/60 cursor-crosshair">
      {zoomKeyframes.length === 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500">
          Double-click to add a zoom
        </span>
      )}
      {zoomKeyframes.map((kf) => {
        const leftPct = durationMs > 0 ? (kf.t / durationMs) * 100 : 0;
        const duration = kf.duration_ms || 1500;
        const widthPct = durationMs > 0 ? (duration / durationMs) * 100 : 10;

        return (
          <div
            key={`zoom-span-${kf.t}`}
            onClick={e => { e.stopPropagation(); onSelectKeyframe?.(kf); }}
            className={`group absolute top-0.5 bottom-0.5 rounded border hover:bg-violet-500/30 transition-colors flex items-center justify-between px-1 cursor-pointer select-none ${selectedTime === kf.t ? "bg-violet-500/30 border-violet-300 ring-1 ring-violet-300/50" : "bg-emerald-500/20 border-emerald-400/60"}`}
            style={{
              left: `${leftPct}%`,
              width: `${Math.max(2, widthPct)}%`,
            }}
          >
            {/* Left Resize Handle */}
            <div
              onMouseDown={(e) => startResizeLeft(kf, e)}
              className="w-1.5 h-full -ml-1 cursor-ew-resize hover:bg-emerald-400/80 rounded-l"
              title="Drag to extend/shorten zoom start"
            />

            {/* Center Info Tag */}
            <div className="flex-1 flex items-center justify-center gap-1 overflow-hidden pointer-events-none">
              <span className="text-[10px] font-mono font-bold text-emerald-300 truncate">
                {kf.zoom}x
              </span>
            </div>

            {/* Right Resize Handle */}
            <div
              onMouseDown={(e) => startResizeRight(kf, e)}
              className="w-1.5 h-full -mr-1 cursor-ew-resize hover:bg-emerald-400/80 rounded-r"
              title="Drag to extend/shorten zoom duration"
            />

            {/* Quick delete on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteKeyframe(kf.t);
              }}
              className="hidden group-hover:flex absolute -top-2 -right-1 w-3.5 h-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white items-center justify-center text-[9px] font-bold z-30"
              title="Delete Zoom Block"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
