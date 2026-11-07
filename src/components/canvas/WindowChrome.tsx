import React from "react";
import { WindowChromeConfig } from "../../lib/types";
import { Minus, Square, X } from "lucide-react";

interface WindowChromeProps {
  config: WindowChromeConfig;
  defaultTitle?: string;
}

export const WindowChrome: React.FC<WindowChromeProps> = ({
  config,
  defaultTitle = "Display Capture · 4K 60fps Source",
}) => {
  if (!config.show_chrome) return null;

  const title = config.title || defaultTitle;

  if (config.chrome_style === "windows") {
    return (
      <div className="h-9 bg-zinc-900/95 border-b border-zinc-800 flex items-center justify-between px-3 select-none text-zinc-400">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 flex items-center justify-center text-[10px] text-emerald-400 font-bold">
            ●
          </div>
          <span className="text-xs font-normal text-zinc-300 truncate max-w-xs">
            {title}
          </span>
        </div>
        <div className="flex items-center h-full -mr-3">
          <button className="h-full px-3 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <Minus size={11} />
          </button>
          <button className="h-full px-3 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <Square size={10} />
          </button>
          <button className="h-full px-3 hover:bg-rose-600 text-zinc-400 hover:text-white transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (config.chrome_style === "minimal") {
    return (
      <div className="h-6 bg-zinc-900/60 border-b border-zinc-800/40 flex items-center justify-center select-none">
        <div className="w-12 h-1 rounded-full bg-zinc-700/60" />
      </div>
    );
  }

  // Default macOS style
  return (
    <div className="h-8 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center px-3 gap-2 select-none">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-rose-500/90 border border-rose-600/50 shadow-inner" />
        <div className="w-3 h-3 rounded-full bg-amber-500/90 border border-amber-600/50 shadow-inner" />
        <div className="w-3 h-3 rounded-full bg-emerald-500/90 border border-emerald-600/50 shadow-inner" />
      </div>
      <div className="flex-1 text-center font-mono text-[11px] text-zinc-400 font-medium truncate pr-14">
        {title}
      </div>
    </div>
  );
};
