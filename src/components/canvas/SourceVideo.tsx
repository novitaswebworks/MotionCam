import { useEffect, useRef, useState, type PointerEvent } from "react";

interface Props {
  source: string;
  timeMs: number;
  playing: boolean;
  trimIn: number;
  trimOut: number;
  speed: number;
  onTime: (time: number) => void;
  onDuration: (duration: number) => void;
  onError: (message: string) => void;
  focus?: { x: number; y: number };
  onFocusChange?: (x: number, y: number) => void;
}

export function SourceVideo(props: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<[number, number] | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!props.playing || Math.abs(video.currentTime * 1000 - props.timeMs) > 250) {
      video.currentTime = props.timeMs / 1000;
    }
  }, [props.timeMs, props.playing]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.playbackRate = props.speed;
  }, [props.speed]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!props.playing) { video.pause(); return; }
    let disposed = false;
    void video.play().catch(error => { if (!disposed) latest.current.onError(String(error)); });
    let frame: number;
    const tick = () => {
      const p = latest.current;
      if (video.currentTime * 1000 >= p.trimOut || video.ended) {
        video.currentTime = p.trimIn / 1000;
        if (video.paused) void video.play().catch(error => p.onError(String(error)));
      }
      p.onTime(video.currentTime * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(frame); video.pause(); };
  }, [props.playing, props.source]);
  const chooseFocus = (event: PointerEvent<HTMLElement>) => {
    if (!props.onFocusChange) return;
    const video = ref.current;
    const frame = frameRef.current;
    if (!video || !frame || !video.videoWidth || !video.videoHeight) return;
    const rect = frame.getBoundingClientRect();
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;
    const x = Math.max(0, Math.min(1, (event.clientX - left) / width));
    const y = Math.max(0, Math.min(1, (event.clientY - top) / height));
    if (event.clientX >= left && event.clientX <= left + width && event.clientY >= top && event.clientY <= top + height) props.onFocusChange(x, y);
  };
  return <div className="relative w-full h-full flex items-center justify-center">
    <div ref={frameRef} onPointerDown={chooseFocus} className="relative max-w-full max-h-full overflow-hidden" style={{aspectRatio: dimensions ? `${dimensions[0]} / ${dimensions[1]}` : "16 / 9", height:"100%", width:"auto", maxWidth:"100%"}}>
      <video ref={ref} src={props.source} playsInline preload="auto"
        className="absolute inset-0 block w-full h-full object-contain"
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          if (Number.isFinite(video.duration)) latest.current.onDuration(video.duration * 1000);
          setDimensions([video.videoWidth,video.videoHeight]);
          video.currentTime = latest.current.trimIn / 1000;
        }}
        onError={() => latest.current.onError("The recorded video could not be decoded.")}
      />
      {props.focus && props.onFocusChange && <button type="button" aria-label="Drag zoom focus" onPointerDown={e => {e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e => { if (e.buttons === 1) chooseFocus(e); }} className="absolute z-40 w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white bg-violet-500 shadow-lg cursor-move" style={{left:`${props.focus.x*100}%`,top:`${props.focus.y*100}%`}} title="Drag to choose zoom focus" />}
    </div>
  </div>;
}
