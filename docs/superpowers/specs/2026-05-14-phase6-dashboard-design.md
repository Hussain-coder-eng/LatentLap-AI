# Phase 6 — Interactive Race Dashboard (`dashboard/`)

**Date:** 2026-05-14  
**Status:** APPROVED  
**Project:** LatentLap-AI — McLaren Tire Degradation Intelligence System  
**Author:** Hussain Altufayli  

---

## Problem Statement

Phase 5 produces pre-computed JSON artifacts (predictions, SHAP values). Phase 6 wraps those artifacts in a visually striking, fully interactive web dashboard that:

- Renders a **3D Silverstone circuit** users can spin to any angle, with animated F1 cars that glow red on critical tire degradation
- Animates every number, chart, and panel entrance with intentional motion
- Uses **Higgsfield-generated cinematic media** (track fly-overs, car imagery) as composite visual assets embedded in the UI
- Deploys to Vercel as a static Next.js app (no Python runtime; all data is pre-baked JSON)

The primary audience is F1 engineering internship recruiters — the dashboard must make someone say "what am I looking at?" and then, once explained, "oh that's actually interesting."

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Framework; static export for Vercel |
| `@react-three/fiber` | React wrapper for Three.js WebGL |
| `@react-three/drei` | OrbitControls, Html overlays, Stars, environment |
| `three` | WebGL renderer, CatmullRomCurve3 for track spline |
| `animejs` (v4) | ALL UI animations: panel entrances, number counters, path-following cars, replay sequencing, stagger, cross-fades |
| `recharts` | Race timeline + stint comparison (animated on mount) |
| Tailwind CSS + CSS custom properties | Layout, motion tokens |
| Higgsfield CLI (Seedance 2.0) | Generate cinematic Silverstone/F1 video assets (offline, pre-generated) |

**Deployment:** `next build && next export` → Vercel static hosting. No server-side runtime.

---

## Design System

### Color Palette (Dark Industrial Telemetry)

```css
:root {
  --bg:           #090909;   /* near-black OLED */
  --surface:      #111111;   /* card backgrounds */
  --surface-2:    #1A1A1A;   /* elevated surfaces */
  --border:       #222222;   /* subtle dividers */
  --text-primary: #F0F0F0;
  --text-muted:   #666666;

  /* McLaren brand */
  --mclaren:      #FF8000;   /* papaya orange — primary accent */

  /* Severity scale */
  --sev-0:        #00E676;   /* healthy green */
  --sev-1:        #FFD600;   /* mild amber */
  --sev-2:        #FF6D00;   /* moderate orange */
  --sev-3:        #FF1744;   /* critical red */
  --sev-3-glow:   0 0 12px #FF1744, 0 0 24px #FF174466; /* drop-shadow for cars */
}
```

### Typography

- **Display / HUD numbers:** `Rajdhani` (Google Fonts) — Bold 700 for severity scores, lap numbers, probability percentages. Telemetry readout aesthetic.
- **Data labels / code:** `Fira Code` — data table values, feature names in SHAP panel.
- **Body / UI prose:** `DM Sans` — panel headings, selector labels, tooltip text.

**Never use:** Inter, Roboto, Space Grotesk, Arial.

### Motion Tokens (from motion-design skill)

```css
:root {
  --dur-1: 120ms;  /* micro feedback */
  --dur-2: 180ms;  /* dropdowns, popovers */
  --dur-3: 240ms;  /* panel enters, sheets */
  --dur-4: 300ms;  /* upper bound for product UI */
  --dur-5: 500ms;  /* large surfaces, steep curves only */

  --ease-out-quart:    cubic-bezier(.165, .84, .44, 1);  /* enter/exit */
  --ease-in-out-cubic: cubic-bezier(.645, .045, .355, 1); /* morph/reposition */
  --ease-out-expo:     cubic-bezier(.19, 1, .22, 1);      /* illustrative/hero */
}
```

### Higgsfield Visual Assets (pre-generated offline)

These are generated once using `higgsfield generate create seedance_2_0` and committed to `public/media/` as MP4/WebP files. They are **static assets**, not real-time AI calls.

| Asset | Prompt intent | Usage |
|---|---|---|
| `silverstone_flyover.mp4` | Cinematic drone flyover of Silverstone circuit, overcast British sky, 8s loop | Hero background behind the 3D track |
| `mclaren_car_front.webp` | McLaren F1 car 2022 livery, studio lighting, front 3/4 angle | Car health indicator icon |
| `tire_blister_closeup.mp4` | Extreme close-up of a blistered F1 tire rubber, slow motion, 4s | Blistering mode indicator animation |
| `loading_loop.mp4` | Abstract heat shimmer over asphalt, dark, 3s seamless loop | Page loading screen |

---

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER: LatentLap-AI logo (animated entrance) + Year ▾ Driver ▾ │
├──────────────────────────────┬───────────────────────────────────┤
│                              │                                   │
│   3D SILVERSTONE TRACK       │   TIRE HEALTH PANEL               │
│   (R3F canvas)               │   Rajdhani 3xl severity number    │
│   Background: flyover video  │   Animated fill bar (mode probs)  │
│   Default: 45° tilt          │   Higgsfield car icon             │
│   Drag: orbit any angle      │                                   │
│   Scroll: zoom               │   SHAP EXPLANATION PANEL          │
│                              │   Top 3 features                  │
│   🔴 NOR car (glow if sev≥2) │   Staggered bar entrance          │
│   ⚪ RIC car                  │   Fira Code feature names         │
│                              │                                   │
│   ← Lap 32/52 →  [▶ Replay] │                                   │
│   ══════════●════════════    │                                   │
│   scrubber (drag)            │                                   │
├──────────────────────────────┴───────────────────────────────────┤
│  RACE TIMELINE (full width, Recharts)                            │
│  Severity color band draws left-to-right on mount               │
│  Pit stop markers animate in with bounce (low-frequency delight) │
├──────────────────────────────────────────────────────────────────┤
│  STINT COMPARISON (NOR vs other driver, SVG line draws outward)  │
└──────────────────────────────────────────────────────────────────┘
```

**Mobile (< 768px):** Track takes top 45% of screen, panels stack below as cards, OrbitControls become touch-drag.

---

## Component Specifications

### `Track3D.tsx` — 3D Silverstone Circuit

**Purpose:** Hero element. WebGL canvas with interactive 3D track.

**Implementation:**
- Silverstone circuit extracted as `[x, y]` GPS waypoints normalised to `[-5, 5]` range → `THREE.CatmullRomCurve3`
- Track rendered as `THREE.TubeGeometry` (radius 0.08) with `MeshStandardMaterial` color `#1A1A1A`
- McLaren orange kerb stripes: secondary tube geometry, `#FF8000`, offset by 0.1
- **Camera:** default position `[0, 6, 8]` = 45° tilt looking down at track centre. `fov=50`
- **Controls:** `<OrbitControls>` from drei — drag rotates, scroll zooms, right-click pans. `minPolarAngle=0`, `maxPolarAngle=Math.PI/2` (no flipping under the track)
- **Cars:** `<mesh>` boxes `[0.2, 0.08, 0.35]` positioned via `curve.getPointAt(lapProgress)` + `curve.getTangentAt(lapProgress)` for orientation
- **Deg glow:** When `severity_pred >= 2` → attach `<pointLight color="#FF1744" intensity={severity * 2} distance={2}>` to car mesh. Severity 3 → intensity pulses via `useFrame`: `Math.sin(clock.elapsed * 4) * 0.5 + 1.5`
- **Corner labels:** `<Html>` from drei at Maggotts, Becketts, Copse, Stowe positions. Visible on hover via pointer events
- **Background:** `<video>` element playing `silverstone_flyover.mp4` as a `THREE.VideoTexture` mapped to a large background plane behind the track
- **Stars:** `<Stars>` from drei with `radius=80, count=200, fade` for atmosphere

**Track visual style (user-selectable, default: Style A):**

Four styles tested at `dashboard/prototype/track_styles.html`. Default is Style A per user preference. A style selector in the header lets users switch at runtime.

| Style | Track material color | Emissive | Glow effect |
|---|---|---|---|
| A — Pure White Light Beam | `#FFFFFF` | `#FFFFFF` intensity 0.8 | `0 0 8px #fff, 0 0 20px #fff8` |
| B — McLaren Neon Orange | `#FF8000` | `#FF6000` intensity 0.6 | `0 0 8px #FF8000, 0 0 20px #FF800066` |
| C — Holographic Blueprint | `#00E5FF` | `#00B8D9` intensity 0.5 | `0 0 8px #00E5FF, 0 0 16px #00E5FF55` |
| D — Crimson Void | `#FF1744` | `#CC0033` intensity 0.5 | `0 0 8px #FF1744, 0 0 20px #FF174466` |

In R3F: `MeshStandardMaterial` `emissive` + `emissiveIntensity` controls the track tube. A `PointLight` at the track centroid provides ambient bloom. Selected style stored in context (`trackStyle` state, persisted to `localStorage`).

**Animation spec (motion-design tokens):**
- Camera transition on lap change: spring (interruptible), stiffness=80, damping=20
- Car position lerp between laps: `THREE.Vector3.lerp()` over 400ms `--ease-in-out-cubic`
- Glow intensity ramp on severity change: `--dur-3` (240ms) `--ease-out-quart`

---

### `TireHealth.tsx` — Severity Gauge + Mode Bars

**Purpose:** Responsiveness — updates on every lap change, communicates current tire state at a glance.

**Implementation:**
- Large Rajdhani Bold number showing severity (e.g. `2/3`) — color matches `--sev-{n}`
- On lap change: number animates via `animate(counterEl, { value: newVal, round: 1, easing: 'easeOutExpo', duration: 600 })`
- Mode bars (none / thermal / wear): `animate(barEl, { width: newWidth, easing: 'easeInOutCubic', duration: 240 })` (`--dur-3`)
- Failure mode label (e.g. "Blistering") fades in with `opacity: 0→1` `--dur-2`
- Higgsfield `mclaren_car_front.webp` as car silhouette icon, colored via CSS `filter: hue-rotate()` tinted to severity color
- When severity = 3: entire panel border pulses red glow via `@keyframes` CSS animation (`box-shadow: var(--sev-3-glow)`)

**Motion spec:**
- Number counter: `animate(targets, { value, round: 1, easing: 'easeOutExpo', duration: 600 })` — interruptible; call `.pause()` on old instance before starting new one if user scrubs rapidly
- Bar width: `animate(targets, { width, easing: 'easeInOutCubic', duration: 240 })` (`--dur-3`, on-screen morph)
- Panel border glow: `animation: glow-pulse 1.2s ease infinite` (CSS `@keyframes` — time-based, decorative; only fires at severity 3)

---

### `ShapPanel.tsx` — Top 3 SHAP Features

**Purpose:** Understanding — shows the "why" behind the current prediction.

**Implementation:**
- Reads `shap_data.json[currentLapKey].severity` top 3 by absolute value
- Feature name in Fira Code, SHAP value in Rajdhani
- Bar width = `|shap_value| / maxShapValue * 100%`
- Positive SHAP → McLaren orange bar; negative SHAP → cool blue `#2979FF`
- On lap change: bars slide from `width: 0` to final width with `stagger(40)`: items 1, 2, 3 stagger by 40ms
- Feature name translates from `MB_PeakLatG` → "Maggotts-Becketts Peak G" via a human-readable lookup map

**Motion spec (stagger entrance):**
- Each bar: `animate(barEls, { scaleX: [0, 1], transformOrigin: ['left center', 'left center'], easing: 'easeOutQuart', duration: 240, delay: stagger(40) })`
- Easing: `easeOutQuart` (`--ease-out-quart`) — entering the viewport
- Duration: `--dur-3` (240ms) per bar; stagger: `stagger(40)` across 3 bars

---

### `Timeline.tsx` — Race Severity Band

**Purpose:** Spatial continuity — shows the full race arc in one view.

**Implementation:**
- Recharts `BarChart` with custom cell colors matching severity (`--sev-0` to `--sev-3`)
- Second series: `LapDelta` as an `AreaChart` overlay (right Y-axis), semi-transparent McLaren orange fill
- Pit stop markers: vertical `ReferenceLine` with a downward triangle icon, animate in with `animate(pitMarkerEls, { translateY: [-12, 0], opacity: [0, 1], easing: 'easeOutElastic(1, .6)', duration: 500 })` after chart draws
- On page load: bars animate from height 0 via Recharts `isAnimationActive + animationDuration: 800`
- Current lap: highlighted bar with white border, scrolls into view when scrubber moves

**Motion spec:**
- Bar entrance: Recharts built-in `animationEasing: "ease-out"` `animationDuration: 800ms`
- Pit marker bounce: `animate(pitMarkerEls, { translateY: [-12, 0], opacity: [0, 1], easing: 'easeOutElastic(1, .6)', duration: 500 })` (intentional delight — low-frequency element)
- Current lap highlight shift: `--ease-in-out-cubic` `--dur-2` (on-screen morph)

---

### `Comparison.tsx` — Stint Side-by-Side

**Purpose:** Understanding — NOR vs other driver degradation trajectory.

**Implementation:**
- SVG `<path>` drawn via `strokeDashoffset` animation (classic draw-on effect)
- Selected driver: solid McLaren orange line; the other available driver for that year: dashed blue line. If only one driver is in the data for the selected year, the second line is hidden and the panel shows a "Single driver — no comparison available" notice.
- X-axis: lap number within stint; Y-axis: `severity_pred`
- Shaded region between lines where severity diverges by ≥ 1 (highlights "where they split")
- On mount: both paths draw from lap 1 outward simultaneously over 1200ms `--ease-out-expo` (illustrative, low-frequency)

---

### `LapScrubber.tsx` — Global State Controller

**Purpose:** Direct manipulation — single control that syncs all panels and track position.

**Implementation:**
- `<input type="range">` styled as a racing-themed horizontal slider, McLaren orange thumb
- `onChange` dispatches to a React Context holding `currentLap`, `currentYear`, `currentDriver`
- All components subscribe to context — track cars move, panels update, timeline highlights shift
- Replay mode: `useReplay` hook (Anime.js timeline) auto-increments `currentLap` every 800ms — implemented via `createTimeline({ easing: 'easeOutQuart' }).add(lapRef, { value: nextLap, duration: 400 })` with an 800ms interval
- Keyboard: arrow keys advance lap by 1 (no animation — keyboard high-frequency rule)

---

### `Header.tsx` — Year / Driver Selector

**Purpose:** Navigation — always visible, allows dataset switching.

**Implementation:**
- Custom `<select>` dropdowns styled with Tailwind, McLaren orange focus ring
- On year/driver change: `createTimeline({ easing: 'easeInOutCubic', duration: 300 }).add(panelEls, { opacity: [1, 0] }).add(panelEls, { opacity: [0, 1] })` cross-fades all panel content simultaneously
- Logo: "LatentLap-AI" in Rajdhani, animated character-by-character on page load using `animate(charEls, { translateY: [20, 0], opacity: [0, 1], easing: 'easeOutQuart', duration: 240, delay: stagger(30) })`
- Loading state (while JSON initialises): Higgsfield `loading_loop.mp4` fills the track panel as a full-bleed video

---

## Camera POV System

The 3D track camera reacts to which panel the user is focused on. Five camera states, each triggered by panel focus events dispatched through the shared React Context (`activePanelId`).

### States

| State | Trigger | Camera Position | Look-at |
|---|---|---|---|
| `overview` | Default / no panel focused | `[0, 6, 8]` (45° tilt) | track center `[0, 0, 0]` |
| `follow-driver` | TireHealth panel focused | car position + `[0, 1.5, 2]` offset | car position |
| `corner-focus` | ShapPanel focused AND top SHAP feature is `MB_*`, `Copse_*`, or `Club_*` | corner apex + `[0, 2, 3]` | corner apex |
| `birds-eye` | Timeline or Comparison panel focused | `[0, 14, 0]` (overhead) | track center `[0, 0, 0]` |
| `split` | Comparison with 2 drivers visible | `[0, 10, 4]` | midpoint between two car positions |

### Implementation in `Track3D.tsx`

```typescript
const { activePanelId, topSHAPFeature, carPositions } = useRaceContext()

const cameraTarget = useMemo(() => {
  if (activePanelId === 'tire-health') return { state: 'follow-driver' }
  if (activePanelId === 'shap' && (topSHAPFeature?.startsWith('MB_') || topSHAPFeature?.startsWith('Copse_')))
    return { state: 'corner-focus', corner: topSHAPFeature.split('_')[0] }
  if (activePanelId === 'timeline' || activePanelId === 'comparison') return { state: 'birds-eye' }
  return { state: 'overview' }
}, [activePanelId, topSHAPFeature])

useFrame(({ camera }) => {
  const target = getCameraPosition(cameraTarget, carPositions)
  camera.position.lerp(target.position, 0.04)
  orbitRef.current?.target.lerp(target.lookAt, 0.04)
  orbitRef.current?.update()
})
```

OrbitControls remain enabled — the user can still drag to any angle at any time. A "Reset Camera" button sets `activePanelId = null` to snap back to `overview`.

### Corner Position Map (in `lib/trackPath.ts`)

```typescript
export const CORNER_POSITIONS: Record<string, THREE.Vector3> = {
  MB:    new THREE.Vector3(-1.2, 0, 0.8),
  Copse: new THREE.Vector3(2.1, 0, -1.4),
  Club:  new THREE.Vector3(-0.3, 0, 2.8),
  Stowe: new THREE.Vector3(-2.0, 0, 1.2),
}
```

The `topSHAPFeature` prefix (`MB_PeakLatG` → `MB`) maps directly to these positions, so the camera automatically zooms to whichever corner drove the current prediction.

---

## Data Loading — `lib/data.ts`

```typescript
// Loaded once at app startup from public/data/
import predictionsRaw from '../public/data/predictions.json'
import shapRaw       from '../public/data/shap_data.json'

export function getLap(year: number, driver: string, lapNumber: number): LapData
export function getSHAP(year: number, driver: string, lapNumber: number): SHAPEntry
export function getStint(year: number, driver: string, stintId: number): LapData[]
export function getDriversForYear(year: number): string[]
export function getLapRange(year: number, driver: string): [number, number]
```

No API calls. All data is in the static JSON bundle.

---

## File Structure

```
dashboard/
├── app/
│   ├── layout.tsx                  # fonts, global CSS, metadata
│   ├── page.tsx                    # main layout, Context provider
│   └── components/
│       ├── Track3D.tsx             # R3F canvas, WebGL
│       ├── TireHealth.tsx          # severity gauge, mode bars
│       ├── ShapPanel.tsx           # top-3 SHAP bars
│       ├── Timeline.tsx            # Recharts severity band
│       ├── Comparison.tsx          # SVG line draw comparison
│       ├── LapScrubber.tsx         # global lap control
│       └── Header.tsx              # year/driver selector, logo
├── lib/
│   ├── data.ts                     # typed JSON loaders + selectors
│   ├── trackPath.ts                # Silverstone GPS → Three.js curve
│   ├── useReplay.ts                # Anime.js createTimeline replay hook
│   └── severityColors.ts           # severity → CSS var mapping
├── public/
│   ├── data/
│   │   ├── predictions.json        # from evaluate.py (Phase 5)
│   │   └── shap_data.json          # from evaluate.py (Phase 5)
│   └── media/
│       ├── silverstone_flyover.mp4 # Higgsfield Seedance 2.0
│       ├── mclaren_car_front.webp  # Higgsfield GPT Image 2
│       ├── tire_blister_closeup.mp4# Higgsfield Seedance 2.0
│       └── loading_loop.mp4        # Higgsfield Seedance 2.0
├── styles/
│   └── globals.css                 # CSS custom properties, motion tokens
├── vercel.json                     # static output config
└── package.json
```

---

## Higgsfield Asset Generation Plan

These commands are run once by the developer (not at runtime). Assets committed to `public/media/`.

```bash
# Silverstone flyover (8s loop, cinematic)
higgsfield generate create seedance_2_0 \
  --prompt "Aerial drone flyover of Silverstone Formula 1 circuit, overcast British summer sky, \
  camera slowly orbiting at 100m altitude, asphalt track with white line markings, dark moody \
  atmosphere, cinematic 4K, seamlessly loopable" \
  --duration 8 --aspect_ratio 16:9 --wait

# Tire blister close-up (4s, slow motion)
higgsfield generate create seedance_2_0 \
  --prompt "Extreme macro close-up of a Formula 1 tire showing blistering damage, rubber bubbling \
  under heat, slow motion, dark studio background, dramatic side lighting, photorealistic" \
  --duration 4 --aspect_ratio 1:1 --wait

# Loading loop (3s, abstract heat shimmer)
higgsfield generate create seedance_2_0 \
  --prompt "Abstract heat shimmer rising from dark asphalt race track surface, shallow depth of \
  field, dark moody atmosphere, 3-second seamless loop, no cars or people" \
  --duration 3 --aspect_ratio 16:9 --wait

# McLaren car front image
higgsfield generate create gpt_image_2 \
  --prompt "McLaren F1 2022 car papaya orange livery, front 3/4 angle, studio black background, \
  dramatic rim lighting, photorealistic, clean silhouette, no text or logos" \
  --aspect_ratio 1:1 --resolution 2k --wait
```

---

## Accessibility

- All interactive elements keyboard-navigable (tab + arrow key on scrubber)
- `prefers-reduced-motion`: all `animate()` and `createTimeline()` calls are gated on `window.matchMedia('(prefers-reduced-motion: reduce)').matches`; if true, skip entrance animations and disable replay auto-advance
- Color severity scale supplemented by text labels (not color-only)
- 3D track: `aria-label="Silverstone circuit 3D visualization"` on canvas
- SHAP bars: each bar has `aria-valuenow` + `aria-label="Feature: MB_PeakLatG, contribution: +0.34"`
- Contrast: all text ≥ 4.5:1 on dark backgrounds (verified via `--text-primary: #F0F0F0` on `--bg: #090909`)

---

## Performance Targets

- First Contentful Paint < 1.5s (static JSON + Next.js, no server round trip)
- 3D track: 60fps on MacBook Air M1; Three.js draw call budget < 500
- JSON bundle: `predictions.json` + `shap_data.json` ≤ 10 MB total
- Higgsfield video assets: encoded at H.264, `preload="none"`, lazy-loaded after LCP
- `will-change: transform` applied only to actively animating elements; removed after animation completes

---

## Design Constraints

- No proprietary F1 data; all visualised values are heuristic proxy approximations
- "Blistering" label on the dashboard must always be accompanied by the disclaimer: "heuristic proxy — not a physical tire sensor"  
- Scope locked to McLaren + Silverstone; race selector disabled for other circuits
- No real-time data; replay mode is historical race playback only
