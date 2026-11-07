use crate::capture::cursor::{CursorEvent, CursorEventType};
use crate::project::{CameraKeyframe, ZoomFocusMode};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FocalRegion {
    pub center_x: f64,
    pub center_y: f64,
    pub target_zoom: f64,
    pub start_time_ms: f64,
    pub end_time_ms: f64,
    pub click_count: usize,
}

#[derive(Debug, Clone)]
pub struct AutoFramingConfig {
    /// Minimum time in milliseconds for stationary linger to trigger zoom
    pub dwell_threshold_ms: f64,
    /// Velocity threshold in screens/sec above which camera zooms out to 1.0x
    pub rapid_transit_velocity: f64,
    /// Default zoom factor for single clicks or brief dwells
    pub default_zoom: f64,
    /// Maximum zoom factor for dense click clusters or typing
    pub max_zoom: f64,
    /// Safe boundary padding from canvas edges (percentage 0.0 - 0.2)
    pub edge_padding: f64,
    /// Minimum gap in ms between focal regions before returning to wide 1.0x
    pub min_idle_gap_ms: f64,
}

impl Default for AutoFramingConfig {
    fn default() -> Self {
        Self {
            dwell_threshold_ms: 350.0,
            rapid_transit_velocity: 0.9, // 0.9 screen widths/sec
            default_zoom: 2.0,
            max_zoom: 2.4,
            edge_padding: 0.05,
            min_idle_gap_ms: 800.0,
        }
    }
}

#[derive(Default)]
pub struct ClusterDetector {
    config: AutoFramingConfig,
}

impl ClusterDetector {
    pub fn new(config: AutoFramingConfig) -> Self {
        Self { config }
    }

    /// Read cursor events directly from a `cursor.jsonl` file.
    pub fn read_events_from_jsonl<P: AsRef<Path>>(path: P) -> std::io::Result<Vec<CursorEvent>> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let mut events = Vec::new();

        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<CursorEvent>(&line) {
                events.push(event);
            }
        }

        // Ensure events are chronologically sorted
        events.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));
        Ok(events)
    }

    /// Clamps camera center (x, y) so that with the given zoom level,
    /// the viewport stays safely within [0.0, 1.0] with edge padding.
    pub fn clamp_camera_center(x: f64, y: f64, zoom: f64, padding: f64) -> (f64, f64) {
        if zoom <= 1.0 {
            return (0.5, 0.5);
        }

        let half_span = 0.5 / zoom;
        let min_x = (half_span + padding).min(0.5);
        let max_x = (1.0 - half_span - padding).max(0.5);
        let min_y = (half_span + padding).min(0.5);
        let max_y = (1.0 - half_span - padding).max(0.5);

        (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
    }

    /// Detect clusters of clicks or dwell areas within sliding time windows.
    pub fn detect_focal_regions(&self, events: &[CursorEvent]) -> Vec<FocalRegion> {
        let mut regions = Vec::new();
        if events.is_empty() {
            return regions;
        }

        let mut current_cluster: Vec<&CursorEvent> = Vec::new();
        let mut cluster_clicks = 0;

        for evt in events {
            if let Some(first) = current_cluster.first() {
                let time_from_first = evt.t - first.t;
                let dt = (evt.t - current_cluster.last().unwrap().t).max(1.0) / 1000.0;
                let dx = evt.x - current_cluster.last().unwrap().x;
                let dy = evt.y - current_cluster.last().unwrap().y;
                let velocity = (dx * dx + dy * dy).sqrt() / dt;

                // If user is rapidly moving across the screen, flush existing cluster
                if velocity > self.config.rapid_transit_velocity && time_from_first > 200.0 {
                    if let Some(region) = self.build_region(&current_cluster, cluster_clicks) {
                        regions.push(region);
                    }
                    current_cluster.clear();
                    cluster_clicks = 0;
                }
            }

            if evt.event_type == CursorEventType::Down {
                cluster_clicks += 1;
            }

            current_cluster.push(evt);

            // Check if cluster has reached maturity
            let cluster_duration = evt.t - current_cluster.first().unwrap().t;
            if cluster_duration >= self.config.dwell_threshold_ms {
                // If there's an active click or significant linger
                if cluster_clicks > 0 || cluster_duration >= self.config.dwell_threshold_ms * 1.5 {
                    if let Some(region) = self.build_region(&current_cluster, cluster_clicks) {
                        regions.push(region);
                    }
                    current_cluster.clear();
                    cluster_clicks = 0;
                }
            }
        }

        if !current_cluster.is_empty() && cluster_clicks > 0 {
            if let Some(region) = self.build_region(&current_cluster, cluster_clicks) {
                regions.push(region);
            }
        }

        // Merge adjacent focal regions that are close in time (< min_idle_gap_ms)
        self.merge_adjacent_regions(regions)
    }

    fn build_region(&self, cluster: &[&CursorEvent], click_count: usize) -> Option<FocalRegion> {
        if cluster.is_empty() {
            return None;
        }

        let start_time_ms = cluster.first()?.t;
        let end_time_ms = cluster.last()?.t;

        // Compute centroid (weighted heavier towards clicks if present)
        let mut sum_x = 0.0;
        let mut sum_y = 0.0;
        let mut total_weight = 0.0;

        for evt in cluster {
            let weight = if evt.event_type == CursorEventType::Down {
                4.0
            } else {
                1.0
            };
            sum_x += evt.x * weight;
            sum_y += evt.y * weight;
            total_weight += weight;
        }

        let raw_cx = sum_x / total_weight;
        let raw_cy = sum_y / total_weight;

        // Dynamic zoom: repetitive clicks scale up to max_zoom
        let target_zoom = if click_count >= 3 {
            self.config.max_zoom
        } else {
            self.config.default_zoom
        };

        let (safe_cx, safe_cy) =
            Self::clamp_camera_center(raw_cx, raw_cy, target_zoom, self.config.edge_padding);

        Some(FocalRegion {
            center_x: (safe_cx * 10000.0).round() / 10000.0,
            center_y: (safe_cy * 10000.0).round() / 10000.0,
            target_zoom,
            start_time_ms,
            end_time_ms: end_time_ms.max(start_time_ms + 400.0),
            click_count,
        })
    }

    fn merge_adjacent_regions(&self, regions: Vec<FocalRegion>) -> Vec<FocalRegion> {
        if regions.len() <= 1 {
            return regions;
        }

        let mut merged: Vec<FocalRegion> = Vec::new();

        for r in regions {
            if let Some(prev) = merged.last_mut() {
                let gap = r.start_time_ms - prev.end_time_ms;
                let spatial_dist = ((r.center_x - prev.center_x).powi(2)
                    + (r.center_y - prev.center_y).powi(2))
                .sqrt();

                // If regions are within time gap and geographically close
                if gap <= self.config.min_idle_gap_ms && spatial_dist < 0.25 {
                    prev.end_time_ms = r.end_time_ms;
                    prev.click_count += r.click_count;
                    prev.center_x = (prev.center_x + r.center_x) * 0.5;
                    prev.center_y = (prev.center_y + r.center_y) * 0.5;
                    prev.target_zoom = prev.target_zoom.max(r.target_zoom);
                    continue;
                }
            }
            merged.push(r);
        }

        merged
    }

    /// Generate an optimal camera keyframe sequence from cursor events.
    /// Rapid mouse moves zoom out to 1.0x; focal clusters zoom in to 2.0x.
    pub fn generate_camera_keyframes(&self, events: &[CursorEvent]) -> Vec<CameraKeyframe> {
        let regions = self.detect_focal_regions(events);
        let mut keyframes = Vec::new();

        // Initial default keyframe at t = 0
        keyframes.push(CameraKeyframe {
            t: 0.0,
            x: 0.5,
            y: 0.5,
            zoom: 1.0,
            mode: ZoomFocusMode::Auto,
            duration_ms: Some(300.0),
        });

        for region in regions {
            // Zoom in smoothly before the action starts
            let lead_in_time = (region.start_time_ms - 250.0).max(0.0);
            if lead_in_time > 0.0
                && keyframes
                    .last()
                    .is_none_or(|k| (k.t - lead_in_time).abs() > 100.0)
            {
                // If there was a long gap, ensure camera stayed at 1.0x before leading in
                if let Some(prev) = keyframes.last() {
                    if lead_in_time - prev.t > 1000.0 && prev.zoom > 1.0 {
                        keyframes.push(CameraKeyframe {
                            t: prev.t + 400.0,
                            x: 0.5,
                            y: 0.5,
                            zoom: 1.0,
                            mode: ZoomFocusMode::Auto,
                            duration_ms: Some(400.0),
                        });
                    }
                }
            }

            // Punch into focal cluster
            keyframes.push(CameraKeyframe {
                t: region.start_time_ms,
                x: region.center_x,
                y: region.center_y,
                zoom: region.target_zoom,
                mode: ZoomFocusMode::Auto,
                duration_ms: Some(region.end_time_ms - region.start_time_ms),
            });

            // Zoom back out to 1.0x after focal period completes
            keyframes.push(CameraKeyframe {
                t: region.end_time_ms + 250.0,
                x: 0.5,
                y: 0.5,
                zoom: 1.0,
                mode: ZoomFocusMode::Auto,
                duration_ms: Some(350.0),
            });
        }

        keyframes
    }

    /// Detects long periods of idle inactivity (e.g. static cursor > min_duration_ms)
    /// to generate speed-ramping intervals for 1-click speedup.
    pub fn detect_idle_speed_ramps(
        &self,
        events: &[CursorEvent],
        min_idle_duration_ms: f64,
        speed_multiplier: f64,
    ) -> Vec<crate::project::SpeedRampSegment> {
        let mut ramps = Vec::new();
        if events.len() < 2 {
            return ramps;
        }

        let mut idle_start = &events[0];
        let mut last_idle = &events[0];

        for evt in events.iter().skip(1) {
            let dx = evt.x - idle_start.x;
            let dy = evt.y - idle_start.y;
            let dist = (dx * dx + dy * dy).sqrt();

            if evt.event_type == CursorEventType::Down || dist > 0.04 {
                let idle_duration = last_idle.t - idle_start.t;
                if idle_duration >= min_idle_duration_ms {
                    ramps.push(crate::project::SpeedRampSegment {
                        start_ms: idle_start.t,
                        end_ms: last_idle.t,
                        multiplier: speed_multiplier,
                    });
                }
                idle_start = evt;
                last_idle = evt;
            } else {
                last_idle = evt;
            }
        }

        let final_idle = last_idle.t - idle_start.t;
        if final_idle >= min_idle_duration_ms {
            ramps.push(crate::project::SpeedRampSegment {
                start_ms: idle_start.t,
                end_ms: last_idle.t,
                multiplier: speed_multiplier,
            });
        }

        ramps
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_margin_clamping() {
        // At 2.0x zoom, half span is 0.25. With 0.05 padding, x must be within [0.30, 0.70]
        let (cx, cy) = ClusterDetector::clamp_camera_center(0.05, 0.95, 2.0, 0.05);
        assert!((cx - 0.30).abs() < 1e-4);
        assert!((cy - 0.70).abs() < 1e-4);

        // At 1.0x zoom, camera must stay centered at (0.5, 0.5)
        let (cx1, cy1) = ClusterDetector::clamp_camera_center(0.1, 0.9, 1.0, 0.05);
        assert_eq!(cx1, 0.5);
        assert_eq!(cy1, 0.5);
    }

    #[test]
    fn test_dwell_and_click_keyframe_generation() {
        let detector = ClusterDetector::default();
        let events = vec![
            CursorEvent {
                t: 50.0,
                x: 0.2,
                y: 0.3,
                event_type: CursorEventType::Move,
                btn: None,
                ..Default::default()
            },
            CursorEvent {
                t: 200.0,
                x: 0.45,
                y: 0.45,
                event_type: CursorEventType::Down,
                btn: None,
                ..Default::default()
            },
            CursorEvent {
                t: 250.0,
                x: 0.45,
                y: 0.45,
                event_type: CursorEventType::Up,
                btn: None,
                ..Default::default()
            },
            CursorEvent {
                t: 700.0,
                x: 0.46,
                y: 0.46,
                event_type: CursorEventType::Down,
                btn: None,
                ..Default::default()
            },
        ];

        let keyframes = detector.generate_camera_keyframes(&events);
        assert!(!keyframes.is_empty());
        assert_eq!(keyframes[0].t, 0.0);
        assert_eq!(keyframes[0].zoom, 1.0);

        // Should include a zoom-in keyframe near the click action
        let zoom_in = keyframes.iter().find(|k| k.zoom >= 2.0);
        assert!(zoom_in.is_some());
    }

    #[test]
    fn test_rapid_transit_detection() {
        let detector = ClusterDetector::default();
        // Mouse moves rapidly from 0.1 to 0.9 in 100ms (velocity = 8.0 screens/sec)
        let events = vec![
            CursorEvent {
                t: 100.0,
                x: 0.1,
                y: 0.5,
                event_type: CursorEventType::Move,
                btn: None,
                ..Default::default()
            },
            CursorEvent {
                t: 200.0,
                x: 0.9,
                y: 0.5,
                event_type: CursorEventType::Move,
                btn: None,
                ..Default::default()
            },
        ];

        let regions = detector.detect_focal_regions(&events);
        // Rapid transit with no clicks must not trigger a zoom-in region
        assert!(regions.is_empty());
    }

    #[test]
    fn test_idle_speed_ramps() {
        let detector = ClusterDetector::default();
        let events = vec![
            CursorEvent {
                t: 0.0,
                x: 0.5,
                y: 0.5,
                event_type: CursorEventType::Move,
                btn: None,
                ..Default::default()
            },
            CursorEvent {
                t: 3000.0,
                x: 0.501,
                y: 0.501,
                event_type: CursorEventType::Move,
                btn: None,
                ..Default::default()
            },
            CursorEvent {
                t: 3500.0,
                x: 0.8,
                y: 0.8,
                event_type: CursorEventType::Down,
                btn: None,
                ..Default::default()
            },
        ];

        let ramps = detector.detect_idle_speed_ramps(&events, 2000.0, 2.0);
        assert_eq!(ramps.len(), 1);
        assert_eq!(ramps[0].multiplier, 2.0);
    }
}
