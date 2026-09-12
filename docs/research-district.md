# B20 Research District — first iteration

Extends the existing 13 voxel exhibits without changing the catalog, research data,
or transaction behavior. No new dependencies.

- Camera-aligned grid and decorative network connections are rendered on a single
  bounded-DPR canvas beneath the models. Connections do not represent measured
  financial relationships or actual transfers.
- Network pulses update at 20 Hz; existing model render caching remains active.
- Hover lifts/scales a model and brightens its key light. Software rendering keeps
  the lift/scale behavior. Reduced motion disables lift, scale, and moving pulses.
- The initial camera framing is closer. Selecting a company reframes it beside a
  right-hand research dialog; screens up to 900px use a bottom sheet.
- The existing embedded report remains authoritative and includes its loading/error
  behavior. A full-report link is available above it.
- Existing light theme, index, keyboard navigation, and modal focus handling remain.

Validation: production build and deterministic tests for all 13 models passed.
Browser QA is pending: the cloud browser rejected the supervised local preview
with ERR_BLOCKED_BY_CLIENT. Do not merge until visual QA is completed.

Manual QA: desktop and mobile, pan/zoom, index search/fly-to, select/previous/next,
close/Escape and focus return, full report, light theme, reduced motion, WebGL
and software fallback. Check that camera framing leaves the selected model visible
beside the desktop panel and that report content fits the mobile sheet.
