import { SpringConfig, CameraKeyframe } from "./types";

export interface SpringState1D {
  value: number;
  velocity: number;
  target: number;
}

export interface SpringState3D {
  x: SpringState1D;
  y: SpringState1D;
  zoom: SpringState1D;
}

export const DEFAULT_SPRING_CONFIG: SpringConfig = {
  mass: 1.0,
  stiffness: 170.0,
  damping: 26.0,
};

/**
 * Step a 1D second-order damped spring system using semi-implicit Euler integration.
 */
export function stepSpring1D(
  state: SpringState1D,
  config: SpringConfig,
  dt: number
): SpringState1D {
  const clampedDt = Math.max(0.0001, Math.min(dt, 0.05));
  const displacement = state.value - state.target;
  const springForce = -config.stiffness * displacement;
  const dampingForce = -config.damping * state.velocity;
  const acceleration = (springForce + dampingForce) / config.mass;

  const nextVelocity = state.velocity + acceleration * clampedDt;
  const nextValue = state.value + nextVelocity * clampedDt;

  return {
    value: nextValue,
    velocity: nextVelocity,
    target: state.target,
  };
}

/**
 * Step a 3D kinetic camera (x, y, zoom) through time delta with velocity-adaptive damping.
 * Matches Rust engine implementation in engine/spring.rs.
 */
export function stepCameraSpring(
  current: SpringState3D,
  config: SpringConfig,
  dt: number
): SpringState3D {
  const speed = Math.sqrt(
    current.x.velocity * current.x.velocity + current.y.velocity * current.y.velocity
  );
  // Adaptive damping prevents camera snaps when mouse transits fast across display
  const adaptiveDamping = speed > 2.0 ? config.damping * 1.3 : config.damping;

  const activeConfig: SpringConfig = {
    mass: config.mass,
    stiffness: config.stiffness,
    damping: adaptiveDamping,
  };

  return {
    x: stepSpring1D(current.x, activeConfig, dt),
    y: stepSpring1D(current.y, activeConfig, dt),
    zoom: stepSpring1D(current.zoom, activeConfig, dt),
  };
}

/**
 * Helper to initialize a 3D camera spring state.
 */
export function createCameraSpringState(
  initialX = 0.5,
  initialY = 0.5,
  initialZoom = 1.0
): SpringState3D {
  return {
    x: { value: initialX, velocity: 0, target: initialX },
    y: { value: initialY, velocity: 0, target: initialY },
    zoom: { value: initialZoom, velocity: 0, target: initialZoom },
  };
}

/**
 * Numerically simulates the camera position (x, y, zoom) along keyframes up to targetTimeMs.
 * Allows instant, deterministic scrubbing anywhere on the timeline matching final export.
 */
export function evaluateCameraAtTime(
  keyframes: CameraKeyframe[],
  config: SpringConfig,
  targetTimeMs: number
): { x: number; y: number; zoom: number } {
  if (keyframes.length === 0) {
    return { x: 0.5, y: 0.5, zoom: 1.0 };
  }

  const initial = keyframes[0];
  const camera = createCameraSpringState(initial.x, initial.y, initial.zoom);

  if (targetTimeMs <= 0) {
    return { x: initial.x, y: initial.y, zoom: initial.zoom };
  }

  const dt = 1.0 / 60.0; // 60fps simulation step
  const totalSteps = Math.round(targetTimeMs / (dt * 1000.0));
  let currentKeyframeIdx = 0;

  for (let step = 0; step <= totalSteps; step++) {
    const currentT = step * dt * 1000.0;

    // Advance to next active keyframe if timestamp reached
    while (
      currentKeyframeIdx + 1 < keyframes.length &&
      keyframes[currentKeyframeIdx + 1].t <= currentT
    ) {
      currentKeyframeIdx++;
      const kf = keyframes[currentKeyframeIdx];
      camera.x.target = kf.x;
      camera.y.target = kf.y;
      camera.zoom.target = kf.zoom;
    }

    const next = stepCameraSpring(camera, config, dt);
    camera.x = next.x;
    camera.y = next.y;
    camera.zoom = next.zoom;
  }

  return {
    x: Math.round(camera.x.value * 10000) / 10000,
    y: Math.round(camera.y.value * 10000) / 10000,
    zoom: Math.round(camera.zoom.value * 10000) / 10000,
  };
}
