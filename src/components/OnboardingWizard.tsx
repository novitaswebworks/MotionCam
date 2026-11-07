import React, { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Camera, Mic, Monitor, Volume2 } from "lucide-react";
import { APP_THEMES, AppTheme } from "../lib/appTheme";
import { AudioDevice, DisplayInfo, PermissionStatus } from "../lib/types";
import { RECORDING_QUALITIES, RecordingQuality } from "../lib/recordingPreset";
import { MotionCamMark } from "./brand/MotionCamMark";
import { isWindows, osName } from "../lib/platform";

type PrivacySection = "screen" | "microphone";

interface OnboardingWizardProps {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  displays: DisplayInfo[];
  selectedDisplayId: number | null;
  onSelectDisplay: (id: number) => void;
  audioDevices: AudioDevice[];
  selectedMicId: string | null;
  onSelectMic: (id: string) => void;
  microphoneEnabled: boolean;
  onToggleMicrophone: () => void;
  systemAudioEnabled: boolean;
  onToggleSystemAudio: () => void;
  quality: RecordingQuality;
  onQualityChange: (quality: RecordingQuality) => void;
  onOpenPrivacySettings: (section: PrivacySection) => void;
  permissionStatus: PermissionStatus | null;
  displayPermissionMessage: string | null;
  isRefreshingPermissions: boolean;
  isRequestingMicrophone: boolean;
  isRequestingScreenAccess: boolean;
  onRefreshPermissions: () => void;
  onRequestScreenPermission: () => void;
  onRequestMicrophonePermission: () => void;
  onFinish: () => void;
}

const steps = ["Welcome", "Permissions", "Recording", "Appearance"];

const themeSwatches: Record<AppTheme, string[]> = {
  midnight: ["#101214", "#232629", "#10b981"],
  paper: ["#f4f6f8", "#ffffff", "#109f83"],
  graphite: ["#111316", "#343a42", "#8b9cf3"],
  forest: ["#0b1512", "#1a2b23", "#a5cf54"],
};

function permissionLabel(status: PermissionStatus["microphone"] | undefined, device: "screen" | "microphone") {
  if (!status) return "Checking…";
  if (device === "screen" && status === "not_granted") return "Not granted";
  switch (status) {
    case "granted": return "Granted";
    case "not_determined": return "Not requested";
    case "denied": return `Denied in ${osName}`;
    case "restricted": return `Restricted by ${osName}`;
    case "not_granted": return "Not granted";
    case "unsupported": return "Not available on this platform";
    case "unknown": return "Status unavailable";
  }
}

function permissionTone(status: PermissionStatus["microphone"] | undefined) {
  if (status === "granted") return "text-emerald-400";
  if (status === "not_determined" || status === "not_granted" || !status) return "text-amber-300";
  return "text-rose-300";
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  theme,
  onThemeChange,
  displays,
  selectedDisplayId,
  onSelectDisplay,
  audioDevices,
  selectedMicId,
  onSelectMic,
  microphoneEnabled,
  onToggleMicrophone,
  systemAudioEnabled,
  onToggleSystemAudio,
  quality,
  onQualityChange,
  onOpenPrivacySettings,
  permissionStatus,
  displayPermissionMessage,
  isRefreshingPermissions,
  isRequestingMicrophone,
  isRequestingScreenAccess,
  onRefreshPermissions,
  onRequestScreenPermission,
  onRequestMicrophonePermission,
  onFinish,
}) => {
  const [step, setStep] = useState(0);
  const selectedQuality = RECORDING_QUALITIES.find((item) => item.id === quality) ?? RECORDING_QUALITIES[0];

  return (
    <main className="flex-1 min-h-0 overflow-auto bg-zinc-950 px-6 py-8 text-zinc-100">
      <section className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center">
        <header className="mb-6 flex items-center gap-3">
          <MotionCamMark size={42} />
          <div>
            <div className="text-sm font-semibold tracking-tight">MotionCam setup</div>
            <div className="mt-0.5 text-xs text-zinc-500">Choose a preset for your recordings.</div>
          </div>
        </header>

        <div className="mb-7 grid grid-cols-4 gap-2" aria-label={`Setup step ${step + 1} of ${steps.length}`}>
          {steps.map((label, index) => (
            <div key={label} className="min-w-0">
              <div className={`h-1 rounded-full ${index <= step ? "bg-emerald-500" : "bg-zinc-800"}`} />
              <span className={`mt-2 block truncate text-[11px] ${index === step ? "text-zinc-100" : "text-zinc-500"}`}>{label}</span>
            </div>
          ))}
        </div>

        <div className="min-h-[390px] border border-zinc-800 bg-zinc-900 p-7 sm:p-9">
          {step === 0 && (
            <div className="flex min-h-[330px] flex-col justify-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400">First run</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Set up your recording preset</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                Choose what MotionCam captures, the quality it records at, and the look you want to work in. We’ll save these choices so you can start recording right away next time.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-3 border-y border-zinc-800 py-5">
                <div><span className="block text-xs text-zinc-500">Capture</span><span className="mt-1 block text-sm">Screen and audio</span></div>
                <div><span className="block text-xs text-zinc-500">Quality</span><span className="mt-1 block text-sm">{selectedQuality.label}</span></div>
                <div><span className="block text-xs text-zinc-500">Appearance</span><span className="mt-1 block text-sm">{APP_THEMES.find((item) => item.id === theme)?.label}</span></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400">System access</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">Allow the devices you plan to use</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{osName} controls these permissions. MotionCam can open the relevant settings pane; you choose whether to grant access.</p>

              <div className="mt-4 flex items-center justify-between gap-3 border border-zinc-800 bg-zinc-950 px-3 py-2">
                <span className="text-xs text-zinc-400">Refresh screen and microphone status after returning from Settings.</span>
                <button type="button" onClick={onRefreshPermissions} disabled={isRefreshingPermissions} className="h-8 shrink-0 border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
                  {isRefreshingPermissions ? "Checking…" : "Refresh status"}
                </button>
              </div>

              <div className="mt-6 divide-y divide-zinc-800 border-y border-zinc-800">
                <div className="flex items-center justify-between gap-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Monitor size={17} className="mt-0.5 shrink-0 text-zinc-400" />
                    <div>
                      <div className="text-sm font-medium">Screen capture <span className="text-rose-400">Required</span></div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{isWindows ? "Windows needs no screen permission for recording. If no display is listed, reconnect the monitor and refresh." : "This status comes from macOS. Reopen MotionCam if access is enabled in Settings but no display is found."}</p>
                      {displayPermissionMessage && <p role="status" className="mt-2 text-xs leading-5 text-amber-200">{displayPermissionMessage}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`text-xs ${permissionTone(permissionStatus?.screen_capture)}`}>{permissionLabel(permissionStatus?.screen_capture, "screen")}</span>
                    <div className="flex items-center gap-2">
                      {permissionStatus?.screen_capture !== "granted" && <button type="button" onClick={onRequestScreenPermission} disabled={isRequestingScreenAccess || isRefreshingPermissions || permissionStatus?.screen_capture === "unsupported"} className="h-8 border border-emerald-700 px-3 text-xs text-emerald-200 hover:bg-emerald-950 disabled:opacity-50">{isRequestingScreenAccess ? "Waiting…" : "Request access"}</button>}
                      <button type="button" onClick={() => onOpenPrivacySettings("screen")} className="h-8 border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800">Open settings</button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Volume2 size={17} className="mt-0.5 shrink-0 text-zinc-400" />
                    <div>
                      <div className="text-sm font-medium">System audio <span className="text-zinc-500">Optional</span></div>
                      <p className="mt-1 max-w-md text-xs leading-5 text-zinc-500">{isWindows ? "Windows records whatever is playing on your default output device. Verify it with a short recording." : "macOS provides no separate status check for system-audio recording. Verify it with a short recording after allowing MotionCam in Screen & System Audio Recording."}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-xs text-zinc-400">Not checked</span>
                    <button type="button" onClick={() => onOpenPrivacySettings("screen")} className="h-8 border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800">Open settings</button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Mic size={17} className="mt-0.5 shrink-0 text-zinc-400" />
                    <div><div className="text-sm font-medium">Microphone <span className="text-zinc-500">Optional</span></div><p className="mt-1 text-xs leading-5 text-zinc-500">Allow microphone access only if you want your voice in the recording.</p></div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`text-xs ${permissionTone(permissionStatus?.microphone)}`}>{permissionLabel(permissionStatus?.microphone, "microphone")}</span>
                    <div className="flex items-center gap-2">
                      {permissionStatus?.microphone === "not_determined" && <button type="button" onClick={onRequestMicrophonePermission} disabled={isRequestingMicrophone} className="h-8 border border-emerald-700 px-3 text-xs text-emerald-200 hover:bg-emerald-950 disabled:opacity-50">{isRequestingMicrophone ? "Waiting…" : "Enable microphone"}</button>}
                      {permissionStatus?.microphone === "denied" && <button type="button" onClick={() => onOpenPrivacySettings("microphone")} className="h-8 border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800">Open settings</button>}
                      {permissionStatus?.microphone !== "denied" && <button type="button" onClick={() => onOpenPrivacySettings("microphone")} className="h-8 border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800">Open settings</button>}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 py-4">
                  <Camera size={17} className="mt-0.5 shrink-0 text-zinc-500" />
                  <div><div className="text-sm font-medium text-zinc-400">Camera <span className="text-zinc-600">Unavailable in this build</span></div><p className="mt-1 text-xs leading-5 text-zinc-500">Face-camera recording is not connected yet, so MotionCam won’t request camera access during setup.</p></div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400">Recording preset</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">Choose what and how to record</h1>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-xs text-zinc-400">Display
                  <select value={selectedDisplayId ?? ""} onChange={(event) => onSelectDisplay(Number(event.target.value))} disabled={!displays.length} className="h-10 border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50">
                    {displays.length ? displays.map((display) => <option key={display.id} value={display.id}>{display.name} · {display.width} × {display.height}{display.is_primary ? " · Main" : ""}</option>) : <option value="">Grant screen access, then reopen MotionCam</option>}
                  </select>
                </label>
                <label className="grid gap-2 text-xs text-zinc-400">Recording quality
                  <select value={quality} onChange={(event) => onQualityChange(event.target.value as RecordingQuality)} className="h-10 border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100">
                    {RECORDING_QUALITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-6 divide-y divide-zinc-800 border-y border-zinc-800">
                <label className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm">
                  <span className="flex items-center gap-2"><Mic size={15} className="text-zinc-400" />Record microphone</span>
                  <input aria-label="Record microphone" type="checkbox" checked={microphoneEnabled} onChange={onToggleMicrophone} className="accent-emerald-500" />
                </label>
                {microphoneEnabled && <label className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="text-zinc-400">Input device</span>
                  <select value={selectedMicId ?? ""} onChange={(event) => onSelectMic(event.target.value)} className="h-9 max-w-[260px] border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100">
                    <option value="">System Default Microphone</option>
                    {audioDevices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.is_default ? " · Default" : ""}</option>)}
                  </select>
                </label>}
                <label className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm">
                  <span className="flex items-center gap-2"><Volume2 size={15} className="text-zinc-400" />Record system audio</span>
                  <input aria-label="Record system audio" type="checkbox" checked={systemAudioEnabled} onChange={onToggleSystemAudio} className="accent-emerald-500" />
                </label>
              </div>
              <p className="mt-3 text-xs text-zinc-500">{selectedQuality.description} Capture resolution and frame rate are applied to the recorded video.</p>
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400">Appearance</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">Choose your workspace theme</h1>
              <p className="mt-2 text-sm text-zinc-400">You can change this any time from the top bar.</p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                {APP_THEMES.map((option) => (
                  <button key={option.id} type="button" aria-pressed={theme === option.id} onClick={() => onThemeChange(option.id)} className={`flex min-h-[112px] items-center justify-between border p-4 text-left transition-colors ${theme === option.id ? "border-emerald-500 bg-zinc-800" : "border-zinc-800 bg-zinc-950 hover:bg-zinc-800/60"}`}>
                    <span><span className="block text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs text-zinc-500">{option.id === "paper" ? "Light" : "Dark"} workspace</span></span>
                    <span className="flex gap-1.5" aria-hidden="true">{themeSwatches[option.id].map((color) => <span key={color} className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</span>
                    {theme === option.id && <Check size={15} className="sr-only" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-between">
          <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="inline-flex h-9 items-center gap-1 px-2 text-sm text-zinc-400 hover:text-zinc-100 disabled:invisible">
            <ChevronLeft size={15} /> Back
          </button>
          <div className="flex gap-2">
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} className="inline-flex h-9 items-center gap-2 bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500">
                Continue <ChevronRight size={15} />
              </button>
            ) : (
              <button type="button" onClick={onFinish} className="inline-flex h-9 items-center gap-2 bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500">
                <Check size={15} /> Save preset
              </button>
            )}
          </div>
        </footer>
      </section>
    </main>
  );
};
