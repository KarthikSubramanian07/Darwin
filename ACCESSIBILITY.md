# Accessibility

Darwin’s marketing pages and live dashboard aim for WCAG 2.2 AA.

## What’s covered

- Skip links into main content on the site and lab shell
- Landmarks, page titles, and `lang` on HTML shells
- Visible `:focus-visible` rings on controls and keyboard-scrollable regions
- Dialogs that trap focus, restore it, and close on Escape (demo source picker)
- Contrast for body, muted, and accent text on the zinc surfaces
- 24×24 px minimum target size and 320 px reflow for chrome and the run library
- `prefers-reduced-motion` for entrance and looping motion
- Live activity feed announced with `aria-live="polite"` and keyboard-scrollable

## 3D score landscape

The WebGL fitness landscape is decorative for spatial trend. It is marked as such and paired with a text summary; keyboard users should use the race grid and activity feed for scores, winners, and outcomes. Colour on cells is not the only cue (labels, crown marker, and text scores).

## Gaps that stay intentional

- Live runs need a backend or the mock source; without either, the run view stays empty.
- Pixel-perfect reading of peaks in the 3D canvas is not possible with assistive tech; use the grid and feed.
