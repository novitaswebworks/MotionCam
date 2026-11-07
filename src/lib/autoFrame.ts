import { CursorEvent, CameraKeyframe } from "./types";

export interface FocalRegion {
  centerX: number;
  centerY: number;
  targetZoom: number;
  startTimeMs: number;
  endTimeMs: number;
  clickCount: number;
}

/**
 * Clamps camera center (x, y) so that with the given zoom level,
 * the viewport stays safely within [0.0, 1.0] with edge padding.
 */
export function clampCameraCenter(
  x: number,
  y: number,
  zoom: number,
  padding = 0.05
): { x: number; y: number } {
  if (zoom <= 1.0) {
    return { x: 0.5, y: 0.5 };
  }

  const halfSpan = 0.5 / zoom;
  const minX = Math.min(0.5, halfSpan + padding);
  const maxX = Math.max(0.5, 1.0 - halfSpan - padding);
  const minY = Math.min(0.5, halfSpan + padding);
  const maxY = Math.max(0.5, 1.0 - halfSpan - padding);

  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/**
 * Analyzes a sequence of cursor events to detect clusters of clicks
 * or dwell periods and produces smooth camera keyframes.
 */
export function generateAutoFramingKeyframes(
  events: CursorEvent[],
  dwellThresholdMs = 350,
  defaultZoom = 2.0,
  maxZoom = 2.4
): CameraKeyframe[] {
  if (events.length === 0) {
    return [{ t: 0, x: 0.5, y: 0.5, zoom: 1.0 }];
  }

  const regions: FocalRegion[] = [];
  let currentCluster: CursorEvent[] = [];
  let clickCount = 0;

  for (const evt of events) {
    if (evt.type === "down") {
      clickCount++;
    }

    currentCluster.push(evt);
    const duration = evt.t - currentCluster[0].t;

    if (duration >= dwellThresholdMs) {
      if (clickCount > 0 || duration >= dwellThresholdMs * 1.5) {
        // Compute centroid
        let sumX = 0;
        let sumY = 0;
        let totalWeight = 0;

        for (const c of currentCluster) {
          const w = c.type === "down" ? 4.0 : 1.0;
          sumX += c.x * w;
          sumY += c.y * w;
          totalWeight += w;
        }

        const rawCx = sumX / totalWeight;
        const rawCy = sumY / totalWeight;
        const targetZoom = clickCount >= 3 ? maxZoom : defaultZoom;
        const safe = clampCameraCenter(rawCx, rawCy, targetZoom);

        regions.push({
          centerX: safe.x,
          centerY: safe.y,
          targetZoom,
          startTimeMs: currentCluster[0].t,
          endTimeMs: Math.max(evt.t, currentCluster[0].t + 400),
          clickCount,
        });

        currentCluster = [];
        clickCount = 0;
      }
    }
  }

  const keyframes: CameraKeyframe[] = [
    { t: 0, x: 0.5, y: 0.5, zoom: 1.0, duration_ms: 300 },
  ];

  for (const r of regions) {
    // Lead-in zoom
    const leadIn = Math.max(0, r.startTimeMs - 250);
    if (leadIn > 0 && Math.abs(keyframes[keyframes.length - 1].t - leadIn) > 100) {
      keyframes.push({
        t: leadIn,
        x: 0.5,
        y: 0.5,
        zoom: 1.0,
        duration_ms: 250,
      });
    }

    // Focal punch-in
    keyframes.push({
      t: r.startTimeMs,
      x: r.centerX,
      y: r.centerY,
      zoom: r.targetZoom,
      duration_ms: r.endTimeMs - r.startTimeMs,
    });

    // Zoom back out to 1.0x wide
    keyframes.push({
      t: r.endTimeMs + 250,
      x: 0.5,
      y: 0.5,
      zoom: 1.0,
      duration_ms: 350,
    });
  }

  return keyframes;
}
