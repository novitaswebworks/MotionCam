import React, { useEffect, useRef, useState, useMemo } from "react";
import { WebcamConfig } from "../../lib/types";
import { User, Video } from "lucide-react";

interface WebcamOverlayProps {
  config: WebcamConfig;
  camera: { x: number; y: number; zoom: number };
}

export const WebcamOverlay: React.FC<WebcamOverlayProps> = ({ config, camera }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStream, setHasStream] = useState<boolean>(false);

  // Connect to live camera if available
  useEffect(() => {
    if (!config.enabled) {
      setHasStream(false);
      return;
    }

    let activeStream: MediaStream | null = null;

    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const constraints: MediaStreamConstraints = {
            video: config.device_id
              ? { deviceId: { exact: config.device_id } }
              : true,
            audio: false,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          activeStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setHasStream(true);
          }
        }
      } catch {
        // Fallback gracefully to high-aesthetic simulated presenter
        setHasStream(false);
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [config.enabled, config.device_id]);

  // Compute smart auto-dodge corner position based on kinetic camera focal point
  const resolvedPosition = useMemo(() => {
    if (!config.auto_dodge || camera.zoom < 1.3) {
      return config.position;
    }

    const { x, y } = camera;
    const isBottom = y > 0.58;
    const isTop = y < 0.42;
    const isRight = x > 0.58;
    const isLeft = x < 0.42;

    switch (config.position) {
      case "bottom_right":
        return isBottom && isRight ? "top_right" : "bottom_right";
      case "bottom_left":
        return isBottom && isLeft ? "top_left" : "bottom_left";
      case "top_right":
        return isTop && isRight ? "bottom_right" : "top_right";
      case "top_left":
        return isTop && isLeft ? "bottom_left" : "top_left";
      default:
        return config.position;
    }
  }, [config.auto_dodge, config.position, camera.x, camera.y, camera.zoom]);

  if (!config.enabled) {
    return null;
  }

  // Position CSS classes with animated transitions
  const positionClasses = {
    bottom_right: "bottom-6 right-6",
    bottom_left: "bottom-6 left-6",
    top_right: "top-8 right-6",
    top_left: "top-8 left-6",
  }[resolvedPosition] || "bottom-6 right-6";

  // Shape CSS classes
  const shapeClass = {
    circle: "rounded-full aspect-square",
    squircle: "rounded-[28%] aspect-square",
    rectangle: "rounded-2xl aspect-[4/3]",
  }[config.shape] || "rounded-full aspect-square";

  // Diffuse shadow
  const shadowStyle = config.shadow
    ? "0 20px 35px -10px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 0, 0, 0.4)"
    : undefined;

  return (
    <div
      className={`absolute z-20 pointer-events-none transition-all duration-300 ease-out ${positionClasses}`}
      style={{
        width: `${config.size}px`,
        boxShadow: shadowStyle,
      }}
    >
      <div
        className={`w-full overflow-hidden bg-zinc-900 relative border flex items-center justify-center transition-all duration-300 ${shapeClass}`}
        style={{
          borderWidth: `${config.border_width}px`,
          borderColor: config.border_color,
          transform: config.mirror ? "scaleX(-1)" : undefined,
        }}
      >
        {/* Real Webcam Video Stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            hasStream ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Fallback Cinematic Studio Presenter Portrait (shown when camera permission pending or previewing) */}
        {!hasStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 p-3 select-none">
            {/* Ambient lighting ring */}
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-1 shadow-inner">
              <User size={22} />
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Face Cam</span>
            </div>
          </div>
        )}

        {/* Live Active Recording Indicator Pip */}
        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none flex items-center gap-1 bg-black/50 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <Video size={9} className="text-zinc-300" />
        </div>
      </div>
    </div>
  );
};
