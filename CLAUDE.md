# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step. Open `index.html` directly in a modern browser (Chrome, Edge, or Firefox). The app uses ES6 modules, so it must be served over HTTP or opened from a local file server — not via `file://` if CORS restrictions apply. A simple approach:

```
npx serve .
# or
python -m http.server 8080
```

A Logitech G923 (or compatible) wheel/pedal set must be connected and recognized by the browser's Gamepad API. Press any button on the wheel to activate the gamepad before the app can read input.

## Architecture

The app is pure Vanilla JavaScript (no framework, no bundler, no dependencies). All logic runs in the browser via ES6 modules, driven by a `requestAnimationFrame` loop.

### Data Flow

```
Hardware Gamepad
    ↓ [Gamepad API, every frame]
js/input.js (InputManager)
    → normalized throttle & steering (0–1 scale)
js/grip-model.js (GripModel)
    → physics state: upperLimit, lowerLimit, target, spinFactor
js/stats.js (Stats)
    → accuracy %, spin count, best streak, avg reaction time
js/canvas.js (Renderer)
    → Canvas visualization (graphs, gauges, overlays)
js/main.js
    → audio beep + red flash when over limit
```

### Module Roles

| File | Role |
|------|------|
| `js/main.js` | App orchestrator: animation loop, UI events, mode switching, audio alerts |
| `js/grip-model.js` | Core physics: 4 discipline modes, steering→throttle corridor calculation, spinFactor dynamics |
| `js/input.js` | Gamepad API polling, axis normalization (−1/+1 → 0–1), axis index/inversion config |
| `js/canvas.js` | Canvas rendering: 300-frame history graphs, gauges, mode-specific overlays |
| `js/modes.js` | Training drill state machines: CurveFollowerMode and ReactionDrillMode |
| `js/stats.js` | Frame-by-frame metrics, JSON export |
| `js/hid.js` | Legacy WebHID code — unused, not imported anywhere |

### Physics Model

`grip-model.js` exports a single `GripModel` class with 4 modes configured in `MODE_CONFIG`. The core formula (base mode):

```javascript
steerDev = |steering − 0.5| × 2            // 0 = straight, 1 = full lock
upperLimit = max(0.05, 1.0 − steerDev × k) // k = sensitivity slider (0.5–2.5)
lowerLimit = upperLimit × bandRatio
target = upperLimit × targetRatio
// spinFactor drops when throttle > upperLimit, recovers when under
```

Mode differences:
- **base** — general training, balanced drop/recovery (1.5/s drop, 0.8/s recovery)
- **f1** — high precision, speed-dependent limits, fast punishment / very slow recovery (2.8/s drop, 0.18/s recovery)
- **rallycross** — controlled slip, intentionally low target (75%), fast recovery (0.35/s drop, 2.8/s recovery), spinFactor never goes below 50%
- **mx5** — progressive tire temperature penalty: prolonged oversteer reduces the upper limit further over time

To add a new discipline, add an entry to `MODE_CONFIG` in `grip-model.js` and a corresponding button/tab in `index.html`.

## UI Language

All user-facing text (labels, mode names, error messages, `docs.html`) is in **Hungarian**. Code comments are in English. Keep this separation when adding features.

## Key Conventions

- Physics uses **deltaTime** (seconds), not frame counts — keep it frame-rate independent.
- Canvas rendering reads from `Renderer`'s internal 300-frame circular buffers; push new values each frame before calling `draw()`.
- `InputManager` exposes `.throttle` and `.steering` as normalized 0–1 values after calling `.poll()`.
- The Gamepad API requires the gamepad to be "activated" (button press) before axes are readable; `input.js` handles this by checking `navigator.getGamepads()` every frame.
