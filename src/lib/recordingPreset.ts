export const RECORDING_QUALITIES = [
  {
    id: "source_60",
    label: "Original · 60 fps",
    description: "Use the display’s native resolution.",
  },
  {
    id: "full_hd_30",
    label: "Up to 1080p · 30 fps",
    description: "Smaller files with smooth playback.",
  },
  {
    id: "full_hd_60",
    label: "Up to 1080p · 60 fps",
    description: "More detail in fast motion.",
  },
] as const;

export type RecordingQuality = (typeof RECORDING_QUALITIES)[number]["id"];

export interface RecordingPreset {
  onboardingComplete: boolean;
  displayId: number | null;
  microphoneDeviceId: string | null;
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
  quality: RecordingQuality;
}

export const DEFAULT_RECORDING_PRESET: RecordingPreset = {
  onboardingComplete: false,
  displayId: null,
  microphoneDeviceId: null,
  microphoneEnabled: true,
  systemAudioEnabled: true,
  quality: "source_60",
};

const STORAGE_KEY = "motioncam.recording-preset";

export function readRecordingPreset(): RecordingPreset {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_RECORDING_PRESET;

    const parsed = JSON.parse(saved) as Partial<RecordingPreset>;
    return {
      ...DEFAULT_RECORDING_PRESET,
      ...parsed,
      quality: RECORDING_QUALITIES.some((quality) => quality.id === parsed.quality)
        ? parsed.quality as RecordingQuality
        : DEFAULT_RECORDING_PRESET.quality,
    };
  } catch {
    return DEFAULT_RECORDING_PRESET;
  }
}

export function saveRecordingPreset(preset: RecordingPreset) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
  } catch {
    // The current session continues to use the selected preset.
  }
}
