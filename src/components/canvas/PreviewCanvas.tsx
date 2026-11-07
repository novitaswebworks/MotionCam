import React from "react";
import { SourceVideo } from "./SourceVideo";
import { CanvasConfig, CursorEvent, SubtitleCue } from "../../lib/types";
import { SpringState3D } from "../../lib/spring";
import { WindowChrome } from "./WindowChrome";
import { VectorCursor } from "./VectorCursor";
import { KeystrokeBadge } from "./KeystrokeBadge";
import { WebcamOverlay } from "./WebcamOverlay";
import { SubtitlesOverlay } from "./SubtitlesOverlay";

interface PreviewCanvasProps {
  canvasConfig: CanvasConfig;
  camera: SpringState3D;
  cursor?: CursorEvent | null;
  activeShortcut?: string | null;
  subtitles?: SubtitleCue[];
  currentTimeMs?: number;
  media?: React.ComponentProps<typeof SourceVideo>;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  canvasConfig,
  camera,
  cursor = null,
  activeShortcut = null,
  subtitles = [],
  currentTimeMs = 0,
  media,
}) => {
  const { aspect_ratio, background, window: winConfig, cursor: cursorConfig } = canvasConfig;

  // Aspect ratio mapping with explicit max bounding box constraints
  const aspectClass = {
    "16:9": "aspect-video max-w-4xl max-h-[75vh]",
    "9:16": "aspect-[9/16] max-h-[82vh]",
    "1:1": "aspect-square max-h-[75vh]",
    "4:5": "aspect-[4/5] max-h-[78vh]",
  }[aspect_ratio] || "aspect-video max-w-4xl max-h-[75vh]";

  // Background styling computation
  const getBackgroundStyle = (): React.CSSProperties => {
    switch (background.type) {
      case "mesh_gradient": {
        const c0 = background.colors[0] || "#064e3b";
        const c1 = background.colors[1] || "#059669";
        const c2 = background.colors[2] || "#a7f3d0";
        return {
          background: `radial-gradient(at 0% 0%, ${c0} 0px, transparent 55%),
                       radial-gradient(at 100% 0%, ${c1} 0px, transparent 55%),
                       radial-gradient(at 100% 100%, ${c2} 0px, transparent 55%),
                       linear-gradient(135deg, ${c0}, ${c1})`,
          filter: background.blur > 0 ? `blur(${background.blur / 4}px)` : undefined,
        };
      }
      case "radial_gradient": {
        const c0 = background.colors[0] || "#1e1b4b";
        const c1 = background.colors[1] || "#09090b";
        return {
          background: `radial-gradient(circle at center, ${c0} 0%, ${c1} 100%)`,
        };
      }
      case "blurred_wallpaper": {
        return {
          background: `linear-gradient(135deg, #1e293b, #0f172a, #020617)`,
          filter: `blur(${background.blur / 2}px)`,
        };
      }
      case "solid":
        return { backgroundColor: background.color };
      case "transparent":
      default:
        return {};
    }
  };

  const isTransparent = background.type === "transparent";
  const hasNoise =
    (background.type === "mesh_gradient" || background.type === "radial_gradient") &&
    background.noise;

  // Kinetic camera zoom & pan transform
  const zoom = Math.max(1.0, camera.zoom.value);
  const translateX = (0.5 - camera.x.value) * (zoom - 1) * 100;
  const translateY = (0.5 - camera.y.value) * (zoom - 1) * 100;

  // macOS-style multi-tier diffuse box shadow
  const shadowRadius = winConfig.shadow_radius;
  const shadowOpacity = winConfig.shadow_opacity;
  const diffuseShadow = `0 ${shadowRadius * 0.25}px ${shadowRadius * 0.5}px rgba(0, 0, 0, ${shadowOpacity * 0.7}),
                         0 ${shadowRadius * 0.5}px ${shadowRadius}px rgba(0, 0, 0, ${shadowOpacity * 0.5}),
                         0 ${shadowRadius}px ${shadowRadius * 1.5}px rgba(0, 0, 0, ${shadowOpacity * 0.3})`;

  const windowPadding = winConfig.window_padding ?? 10;
  const windowWidthPct = 100 - windowPadding * 2;
  const windowHeightPct = 100 - windowPadding * 2;

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-zinc-950 overflow-hidden relative select-none">
      {/* Outer Studio Aspect Viewport */}
      <div
        className={`w-full ${aspectClass} rounded-2xl relative overflow-hidden flex items-center justify-center transition-all duration-300 shadow-2xl border border-zinc-800/80`}
      >
        {/* Transparent Checkerboard Pattern (shown only when transparent) */}
        {isTransparent && (
          <div
            className="absolute inset-0 z-0 opacity-20"
            style={{
              backgroundImage: `linear-gradient(45deg, #27272a 25%, transparent 25%),
                                linear-gradient(-45deg, #27272a 25%, transparent 25%),
                                linear-gradient(45deg, transparent 75%, #27272a 75%),
                                linear-gradient(-45deg, transparent 75%, #27272a 75%)`,
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          />
        )}

        {/* Dynamic Studio Background */}
        {!isTransparent && (
          <div
            className="absolute inset-0 z-0 pointer-events-none transition-all duration-300"
            style={getBackgroundStyle()}
          />
        )}

        {/* Subtle Noise Grain Texture */}
        {hasNoise && !isTransparent && (
          <div
            className="absolute inset-0 z-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />
        )}

        {/* Framed Window Layer (Target of Camera Zoom & Transform) */}
        <div
          className="relative z-10 bg-zinc-900 border border-zinc-700/60 overflow-hidden flex flex-col will-change-transform"
          style={{
            width: `${windowWidthPct}%`,
            height: `${windowHeightPct}%`,
            borderRadius: `${winConfig.border_radius}px`,
            boxShadow: diffuseShadow,
            transform: `translate3d(${translateX}%, ${translateY}%, 0) scale(${zoom})`,
            transformOrigin: `${camera.x.value * 100}% ${camera.y.value * 100}%`,
          }}
        >
          {/* Window Chrome Header */}
          <WindowChrome config={winConfig} />

          {/* Window Viewport Area */}
          <div className="flex-1 bg-zinc-950/70 flex items-center justify-center relative overflow-hidden">
            {media ? <SourceVideo {...media} /> : <p className="p-6 text-sm text-zinc-400">Record a display to begin editing.</p>}

            {/* Crisp Synthetic SVG Vector Cursor Overlay */}
            <VectorCursor cursor={cursor} config={cursorConfig} />
          </div>
        </div>

        {/* Floating Face Cam (Webcam) Overlay */}
        <WebcamOverlay
          config={canvasConfig.webcam}
          camera={{
            x: camera.x.value,
            y: camera.y.value,
            zoom: camera.zoom.value,
          }}
        />

        {/* Dynamic Subtitles & Karaoke Word Highlight Overlay */}
        <SubtitlesOverlay
          cues={subtitles}
          currentTimeMs={currentTimeMs}
          config={canvasConfig.subtitles}
        />

        {/* Floating Cinematic Keystroke HUD Badge */}
        <KeystrokeBadge shortcut={activeShortcut} config={canvasConfig.keystroke} />
      </div>
    </div>
  );
};
