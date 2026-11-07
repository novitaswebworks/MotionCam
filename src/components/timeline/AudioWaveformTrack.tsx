import React, { useMemo } from "react";

interface AudioWaveformTrackProps {
  durationMs: number;
}

export const AudioWaveformTrack: React.FC<AudioWaveformTrackProps> = ({ durationMs }) => {
  // Generate deterministic audio peak bars simulating speech/sound events
  const peaks = useMemo(() => {
    const barsCount = 90;
    const bars = [];
    for (let i = 0; i < barsCount; i++) {
      const progress = i / barsCount;
      // Synthesize rhythmic speech waves
      const voiceActivity =
        Math.sin(progress * 18) * 0.4 +
        Math.sin(progress * 45) * 0.3 +
        Math.cos(progress * 8) * 0.3;
      const height = Math.max(0.12, Math.min(0.95, Math.abs(voiceActivity)));
      bars.push(height);
    }
    return bars;
  }, [durationMs]);

  return (
    <div className="w-full h-4 flex items-center gap-[2px] opacity-40 px-1 pointer-events-none">
      {peaks.map((peak, idx) => (
        <div
          key={idx}
          className="flex-1 rounded-full bg-zinc-400"
          style={{ height: `${peak * 100}%` }}
        />
      ))}
    </div>
  );
};
