import React from "react";
import { SubtitleCue } from "../../lib/types";
import { MessageSquare } from "lucide-react";

interface SubtitleTrackProps {
  cues: SubtitleCue[];
  durationMs: number;
  currentTimeMs: number;
  onSelectCue?: (cue: SubtitleCue) => void;
}

export const SubtitleTrack: React.FC<SubtitleTrackProps> = ({
  cues,
  durationMs,
  currentTimeMs,
  onSelectCue,
}) => {
  if (cues.length === 0) {
    return null;
  }

  return (
    <div className="w-full h-5 relative flex items-center bg-zinc-950/40 rounded px-0.5 select-none my-0.5">
      <div className="absolute left-1 z-10 flex items-center gap-1 text-[9px] font-mono text-zinc-500 pointer-events-none">
        <MessageSquare size={10} className="text-emerald-400" />
        <span>Subtitles</span>
      </div>

      <div className="w-full h-full relative pl-16">
        {cues.map((cue) => {
          const leftPct = (cue.start_ms / durationMs) * 100;
          const widthPct = Math.max(1.5, ((cue.end_ms - cue.start_ms) / durationMs) * 100);
          const isActive = currentTimeMs >= cue.start_ms && currentTimeMs <= cue.end_ms;

          return (
            <div
              key={cue.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectCue?.(cue);
              }}
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
              }}
              className={`absolute top-0.5 bottom-0.5 rounded px-1.5 flex items-center overflow-hidden cursor-pointer transition-all duration-150 border text-[10px] truncate ${
                isActive
                  ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)] z-10"
                  : "bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:bg-zinc-700/90 hover:border-zinc-500"
              }`}
              title={`${cue.text} (${(cue.start_ms / 1000).toFixed(1)}s - ${(cue.end_ms / 1000).toFixed(1)}s)`}
            >
              <span className="truncate">{cue.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
