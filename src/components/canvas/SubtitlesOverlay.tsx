import React from "react";
import { SubtitleConfig, SubtitleCue } from "../../lib/types";

interface SubtitlesOverlayProps {
  cues: SubtitleCue[];
  currentTimeMs: number;
  config: SubtitleConfig;
}

export const SubtitlesOverlay: React.FC<SubtitlesOverlayProps> = ({
  cues,
  currentTimeMs,
  config,
}) => {
  if (!config.enabled || cues.length === 0) {
    return null;
  }

  // Find active cue for current timestamp
  const activeCue = cues.find(
    (c) => currentTimeMs >= c.start_ms && currentTimeMs <= c.end_ms
  );

  if (!activeCue) {
    return null;
  }

  // Position classes
  const positionClass = {
    bottom_center: "bottom-8 left-1/2 -translate-x-1/2",
    middle_center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
    top_center: "top-10 left-1/2 -translate-x-1/2",
  }[config.position] || "bottom-8 left-1/2 -translate-x-1/2";

  // Container styling based on chosen aesthetic
  const getContainerClass = () => {
    switch (config.style) {
      case "glass_box":
        return "bg-black/65 backdrop-blur-2xl border border-white/15 px-6 py-2.5 rounded-2xl shadow-2xl shadow-black/80";
      case "cinema_caps":
        return "bg-black/75 px-5 py-2 rounded-lg border border-zinc-800 tracking-wider uppercase font-bold shadow-xl";
      case "minimal_text":
        return "px-4 py-1 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]";
      case "word_highlight":
      default:
        return "bg-black/50 backdrop-blur-md px-5 py-2 rounded-2xl border border-white/10 shadow-2xl shadow-black/60";
    }
  };

  return (
    <div
      className={`absolute z-30 pointer-events-none transition-all duration-200 select-none max-w-[85%] text-center ${positionClass}`}
    >
      <div className={`inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 ${getContainerClass()}`}>
        {activeCue.words && activeCue.words.length > 0 ? (
          activeCue.words.map((w, idx) => {
            const isActive =
              currentTimeMs >= w.start_ms && currentTimeMs <= w.end_ms;
            const isPast = currentTimeMs > w.end_ms;

            return (
              <span
                key={idx}
                className={`transition-all duration-150 inline-block ${
                  isActive
                    ? "scale-110 font-bold"
                    : isPast
                    ? "opacity-100 font-semibold"
                    : "opacity-50 font-medium"
                }`}
                style={{
                  fontSize: `${config.font_size}px`,
                  color: isActive ? config.active_color : config.text_color,
                  textShadow: isActive
                    ? `0 0 16px ${config.active_color}80, 0 2px 4px rgba(0,0,0,0.8)`
                    : "0 2px 6px rgba(0,0,0,0.7)",
                }}
              >
                {w.word}
              </span>
            );
          })
        ) : (
          <span
            className="font-semibold"
            style={{
              fontSize: `${config.font_size}px`,
              color: config.text_color,
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}
          >
            {activeCue.text}
          </span>
        )}
      </div>
    </div>
  );
};
