import { useState, useCallback, useRef } from "react";
import { SpeedRampSegment } from "../lib/types";

export interface TimelineOptions {
  durationMs?: number;
  trimInMs?: number;
  trimOutMs?: number;
  speedRamps?: SpeedRampSegment[];
}

export function useTimeline({
  durationMs = 15000,
  trimInMs = 0,
  trimOutMs = 15000,
  speedRamps = [],
}: TimelineOptions = {}) {
  const [currentTimeMs, setCurrentTimeMs] = useState(trimInMs);
  const [isPlaying, setIsPlaying] = useState(false);

  const optionsRef = useRef({ durationMs, trimInMs, trimOutMs, speedRamps });
  optionsRef.current = { durationMs, trimInMs, trimOutMs, speedRamps };

  const seek = useCallback((timeMs: number) => {
    const { trimInMs: tIn, trimOutMs: tOut, durationMs: total } = optionsRef.current;
    const clamped = Math.max(tIn, Math.min(timeMs, tOut || total));
    setCurrentTimeMs(clamped);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Compute effective playback multiplier at a specific timestamp
  const getSpeedMultiplierAtTime = useCallback(
    (timeMs: number): number => {
      const activeRamp = optionsRef.current.speedRamps.find(
        (r) => timeMs >= r.start_ms && timeMs <= r.end_ms
      );
      return activeRamp ? activeRamp.multiplier : 1.0;
    },
    []
  );

  return {
    currentTimeMs,
    isPlaying,
    seek,
    togglePlay,
    setIsPlaying,
    setCurrentTimeMs,
    getSpeedMultiplierAtTime,
  };
}
