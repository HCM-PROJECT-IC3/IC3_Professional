# UX/UI Image Fix — 2026-08-26

## Fixed
- Hotspot images are no longer wrapped with a side-by-side zoom thumbnail.
- Hotspot image keeps its original aspect ratio and uses the full available stage width/height.
- Hotspot zoom control is now placed below the image, so it cannot shrink the image or overlap hotspot coordinates.
- Generic question images now use a stacked zoom control below the image instead of a side-by-side control.
- Zoom controls have visible labels and larger touch targets.
- Responsive behavior is improved for desktop, tablet, and mobile.
- Hotspot hit regions remain tied to the image dimensions and are not affected by the zoom UI.

## Scope
This applies to all question images rendered by the main quiz engine, including all hotspot questions in the Spark/IC3 level data.
