use crate::project::{CameraKeyframe, SpringPhysicsConfig};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SpringState1D {
    pub value: f64,
    pub velocity: f64,
    pub target: f64,
}

impl SpringState1D {
    pub fn new(initial: f64) -> Self {
        Self {
            value: initial,
            velocity: 0.0,
            target: initial,
        }
    }

    /// Step the spring-damper forward by `dt` seconds using semi-implicit Euler integration.
    pub fn step(&mut self, config: &SpringPhysicsConfig, dt: f64) {
        let clamped_dt = dt.clamp(0.0001, 0.05); // Prevent numerical instability
        let displacement = self.value - self.target;
        let spring_force = -config.stiffness * displacement;
        let damping_force = -config.damping * self.velocity;
        let acceleration = (spring_force + damping_force) / config.mass;

        self.velocity += acceleration * clamped_dt;
        self.value += self.velocity * clamped_dt;
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CameraSpringState {
    pub x: SpringState1D,
    pub y: SpringState1D,
    pub zoom: SpringState1D,
}

impl CameraSpringState {
    pub fn new(initial_x: f64, initial_y: f64, initial_zoom: f64) -> Self {
        Self {
            x: SpringState1D::new(initial_x),
            y: SpringState1D::new(initial_y),
            zoom: SpringState1D::new(initial_zoom),
        }
    }

    pub fn set_target(&mut self, target_x: f64, target_y: f64, target_zoom: f64) {
        self.x.target = target_x;
        self.y.target = target_y;
        self.zoom.target = target_zoom;
    }

    /// Step the full 3D kinetic camera state forward.
    pub fn step(&mut self, config: &SpringPhysicsConfig, dt: f64) {
        // Velocity-adaptive damping: if speed is high, increase damping to prevent snappy overshoot
        let speed = (self.x.velocity.powi(2) + self.y.velocity.powi(2)).sqrt();
        let adaptive_damping = if speed > 2.0 {
            config.damping * 1.3
        } else {
            config.damping
        };

        let active_config = SpringPhysicsConfig {
            mass: config.mass,
            stiffness: config.stiffness,
            damping: adaptive_damping,
        };

        self.x.step(&active_config, dt);
        self.y.step(&active_config, dt);
        self.zoom.step(&active_config, dt);
    }
}

/// Numerically simulate the camera spring forward to timestamp `target_time_ms`.
/// Guarantees bit-for-bit deterministic evaluation between preview and export.
pub fn evaluate_camera_at_time(
    keyframes: &[CameraKeyframe],
    config: &SpringPhysicsConfig,
    target_time_ms: f64,
) -> (f64, f64, f64) {
    if keyframes.is_empty() {
        return (0.5, 0.5, 1.0);
    }

    let initial = &keyframes[0];
    let mut camera = CameraSpringState::new(initial.x, initial.y, initial.zoom);

    if target_time_ms <= 0.0 {
        return (initial.x, initial.y, initial.zoom);
    }

    let dt = 1.0 / 60.0; // 60fps simulation step
    let total_steps = (target_time_ms / (dt * 1000.0)).round() as usize;

    let mut current_keyframe_idx = 0;

    for step in 0..=total_steps {
        let current_t = (step as f64) * dt * 1000.0;

        // Advance to next active keyframe if timestamp reached
        while current_keyframe_idx + 1 < keyframes.len()
            && keyframes[current_keyframe_idx + 1].t <= current_t
        {
            current_keyframe_idx += 1;
            let kf = &keyframes[current_keyframe_idx];
            camera.set_target(kf.x, kf.y, kf.zoom);
        }

        camera.step(config, dt);
    }

    (
        (camera.x.value * 10000.0).round() / 10000.0,
        (camera.y.value * 10000.0).round() / 10000.0,
        (camera.zoom.value * 10000.0).round() / 10000.0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::ZoomFocusMode;

    #[test]
    fn test_spring_converges_to_target() {
        let config = SpringPhysicsConfig {
            mass: 1.0,
            stiffness: 170.0,
            damping: 26.0,
        };

        let mut spring = SpringState1D::new(0.0);
        spring.target = 1.0;

        // Step for 1 second at 60fps (1/60s dt)
        let dt = 1.0 / 60.0;
        for _ in 0..120 {
            spring.step(&config, dt);
        }

        // Must converge close to 1.0
        assert!((spring.value - 1.0).abs() < 0.05);
        assert!(spring.velocity.abs() < 0.1);
    }

    #[test]
    fn test_camera_spring_state() {
        let config = SpringPhysicsConfig::default();
        let mut camera = CameraSpringState::new(0.5, 0.5, 1.0);
        camera.set_target(0.8, 0.2, 2.0);

        let dt = 1.0 / 60.0;
        for _ in 0..60 {
            camera.step(&config, dt);
        }

        assert!(camera.x.value > 0.5);
        assert!(camera.zoom.value > 1.0);
    }

    #[test]
    fn test_deterministic_evaluation() {
        let config = SpringPhysicsConfig::default();
        let keyframes = vec![
            CameraKeyframe {
                t: 0.0,
                x: 0.5,
                y: 0.5,
                zoom: 1.0,
                mode: ZoomFocusMode::Manual,
                duration_ms: None,
            },
            CameraKeyframe {
                t: 500.0,
                x: 0.7,
                y: 0.3,
                zoom: 2.0,
                mode: ZoomFocusMode::Manual,
                duration_ms: None,
            },
        ];

        let (x1, y1, z1) = evaluate_camera_at_time(&keyframes, &config, 1000.0);
        let (x2, y2, z2) = evaluate_camera_at_time(&keyframes, &config, 1000.0);

        // Deterministic check
        assert_eq!(x1, x2);
        assert_eq!(y1, y2);
        assert_eq!(z1, z2);
        assert!(z1 > 1.5);
    }
}
