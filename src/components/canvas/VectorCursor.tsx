import React, { useEffect, useState } from "react";
import { CursorConfig, CursorEvent } from "../../lib/types";

interface VectorCursorProps {
  cursor: CursorEvent | null;
  config: CursorConfig;
}

interface TrailPoint {
  x: number;
  y: number;
  id: number;
}

export const VectorCursor: React.FC<VectorCursorProps> = ({ cursor, config }) => {
  const [trail, setTrail] = useState<TrailPoint[]>([]);

  useEffect(() => {
    if (!cursor || !config.smooth_trail) {
      setTrail([]);
      return;
    }

    setTrail((prev) => {
      const nextPoint = { x: cursor.x, y: cursor.y, id: Date.now() };
      const updated = [nextPoint, ...prev.slice(0, 4)];
      return updated;
    });
  }, [cursor?.x, cursor?.y, config.smooth_trail, cursor]);

  if (!cursor) return null;

  const renderSvgPath = () => {
    switch (config.style) {
      case "macos_white":
        return (
          <path
            d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        );
      case "windows_modern":
        return (
          <path
            d="M2 2L8.5 21L12.5 13.5L20 12L2 2Z"
            fill="#FFFFFF"
            stroke="#000000"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        );
      case "neon":
        return (
          <>
            <path
              d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
              fill="#10B981"
              stroke="#A7F3D0"
              strokeWidth="1.5"
              strokeLinejoin="round"
              filter="drop-shadow(0 0 6px #10B981)"
            />
          </>
        );
      case "macos_black":
      default:
        return (
          <path
            d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
            fill="#111827"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        );
    }
  };

  return (
    <>
      {/* Ghost Trail */}
      {config.smooth_trail &&
        trail.map((point, index) => {
          const opacity = (1 - (index + 1) * 0.22) * 0.4;
          return (
            <div
              key={point.id}
              className="absolute pointer-events-none z-20 transition-opacity duration-300"
              style={{
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                opacity,
                transform: `translate(-2px, -2px) scale(${config.scale * 0.95})`,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {renderSvgPath()}
              </svg>
            </div>
          );
        })}

      {/* Main Cursor Pointer */}
      <div
        className="absolute pointer-events-none z-30 transition-transform duration-75 ease-out"
        style={{
          left: `${cursor.x * 100}%`,
          top: `${cursor.y * 100}%`,
          transform: `translate(-2px, -2px) scale(${config.scale})`,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-xl"
        >
          {renderSvgPath()}
        </svg>

        {/* Click Ripple Effect with Spring Rings */}
        {config.click_ripple && cursor.type === "down" && (
          <div className="absolute -top-3 -left-3 pointer-events-none">
            <span className="absolute w-8 h-8 rounded-full bg-emerald-400/50 animate-ping" />
            <span className="absolute w-8 h-8 rounded-full border-2 border-emerald-400/80 scale-125 animate-pulse" />
          </div>
        )}
      </div>
    </>
  );
};
