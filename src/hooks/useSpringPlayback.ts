import { useCallback, useEffect, useRef, useState } from "react";
import { SpringConfig } from "../lib/types";
import {
  SpringState3D,
  createCameraSpringState,
  stepCameraSpring,
  DEFAULT_SPRING_CONFIG,
} from "../lib/spring";

const POSITION_EPSILON = 0.001;
const VELOCITY_EPSILON = 0.003;

export function useSpringPlayback(config: SpringConfig = DEFAULT_SPRING_CONFIG) {
  const [camera, setCamera] = useState<SpringState3D>(() => createCameraSpringState());
  const [targetRevision, setTargetRevision] = useState(0);
  const cameraRef = useRef(camera);

  const setTarget = useCallback((x: number, y: number, zoom: number) => {
    const current = cameraRef.current;
    if (
      Math.abs(current.x.target - x) < POSITION_EPSILON &&
      Math.abs(current.y.target - y) < POSITION_EPSILON &&
      Math.abs(current.zoom.target - zoom) < POSITION_EPSILON
    ) return;

    const updated = {
      x: { ...current.x, target: x },
      y: { ...current.y, target: y },
      zoom: { ...current.zoom, target: zoom },
    };
    cameraRef.current = updated;
    setCamera(updated);
    setTargetRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - previousTime) / 1000, 1 / 30);
      previousTime = now;
      const next = stepCameraSpring(cameraRef.current, config, dt);
      const settled = [next.x, next.y, next.zoom].every(
        (axis) => Math.abs(axis.value - axis.target) < POSITION_EPSILON && Math.abs(axis.velocity) < VELOCITY_EPSILON,
      );

      if (settled) {
        const resting: SpringState3D = {
          x: { ...next.x, value: next.x.target, velocity: 0 },
          y: { ...next.y, value: next.y.target, velocity: 0 },
          zoom: { ...next.zoom, value: next.zoom.target, velocity: 0 },
        };
        cameraRef.current = resting;
        setCamera(resting);
        return;
      }

      cameraRef.current = next;
      setCamera(next);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [config, targetRevision]);

  return { camera, setTarget };
}
