import React from "react";
import { KeystrokeConfig } from "../../lib/types";

interface KeystrokeBadgeProps {
  shortcut?: string | null;
  config: KeystrokeConfig;
}

// Convert common key names to macOS typography symbols
const formatKeySymbol = (key: string): string => {
  switch (key.trim()) {
    case "Enter":
    case "Return":
      return "⏎";
    case "Escape":
    case "Esc":
      return "⎋";
    case "Space":
      return "␣";
    case "Tab":
      return "⇥";
    case "Backspace":
    case "Delete":
      return "⌫";
    default:
      return key.trim();
  }
};

export const KeystrokeBadge: React.FC<KeystrokeBadgeProps> = ({ shortcut, config }) => {
  if (!config.enabled || !shortcut) {
    return null;
  }

  // Split shortcut string e.g. "⌘ + ⇧ + K" into individual key tokens
  const keys = shortcut
    .split("+")
    .map((k) => formatKeySymbol(k))
    .filter(Boolean);

  if (keys.length === 0) {
    return null;
  }

  // Position classes
  const positionClasses = {
    bottom_center: "bottom-6 left-1/2 -translate-x-1/2",
    bottom_left: "bottom-6 left-6",
    top_center: "top-8 left-1/2 -translate-x-1/2",
  }[config.position] || "bottom-6 left-1/2 -translate-x-1/2";

  // Style classes
  const containerStyle = {
    dark_glass:
      "bg-black/60 backdrop-blur-2xl border border-white/15 shadow-2xl shadow-black/80 text-white",
    light_glass:
      "bg-white/70 backdrop-blur-2xl border border-zinc-200/60 shadow-xl shadow-zinc-900/10 text-zinc-900",
    minimal:
      "bg-zinc-900 border border-zinc-700 shadow-lg text-zinc-100",
  }[config.style];

  const keyCapStyle = {
    dark_glass:
      "bg-zinc-800/80 border border-white/20 shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] text-zinc-100",
    light_glass:
      "bg-zinc-100 border border-zinc-300 shadow-[0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] text-zinc-800",
    minimal:
      "bg-zinc-800 border border-zinc-700 text-zinc-200",
  }[config.style];

  return (
    <div
      className={`absolute z-30 pointer-events-none transition-all duration-200 ease-out transform animate-in fade-in zoom-in-95 ${positionClasses}`}
      style={{
        animationDuration: "180ms",
      }}
    >
      <div
        className={`px-3 py-2 rounded-2xl flex items-center gap-1.5 ${containerStyle}`}
      >
        {keys.map((key, idx) => (
          <React.Fragment key={idx}>
            <span
              className={`min-w-7 h-7 px-2 rounded-lg flex items-center justify-center font-mono text-xs font-semibold tracking-wide ${keyCapStyle}`}
            >
              {key}
            </span>
            {idx < keys.length - 1 && (
              <span className="text-[10px] opacity-40 font-bold px-0.5">+</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
