# LatentLap-AI Dashboard Redesign — Design Spec
**Date:** 2026-05-16  
**Status:** Approved for implementation  
**Scope:** Full replacement of the current dashboard UI  

---

## 1. What We Built (The ML System)

LatentLap-AI is a McLaren F1 tire degradation intelligence system for Silverstone, 2021–2025. It ingests public FastF1 telemetry and infers hidden tire state lap-by-lap — information that isn't directly available from official timing data.

### Pipeline summary (for engineers)
| Phase | Script | Output |
|---|---|---|
| Data ingestion | `explore_data.py` | FastF1 session cache |
| Feature engineering | `build_feature_table.py` | Per-lap telemetry features |
| Weak supervision labels | `build_labels.py` | DegSeverity 0–3 heuristic labels |
| XGBoost model | `train_model.py` | Trained model + predictions |
| SHAP explainability | `evaluate.py` | Feature importance per lap |
| Strategy advisor | `strategy.py` | Pit window recommendations |

### Key model outputs per lap
- **DegSeverity** (0–3): overall tire stress estimate. Heuristic proxy — not a physical sensor.
- **Mode probabilities**: Blistering / Thermal / Wear / No Failure (sum to 1.0)
- **SHAP values**: per-feature contribution to the severity prediction (TreeExplainer)
- **Pit strategy**: projected finish severity per pit-lap scenario, primary pit window, confidence

---

## 2. Design Concept

### Core metaphor
A **top-down McLaren F1 car** drives through five narrative chapters as the user scrolls. The car is the persistent anchor — always visible, always in roughly the same screen position. What changes is the **world around it**: the track, the heat, the corner zones, the pit lane. The car and its tires are the visual thread that ties everything together.

### Scroll behavior
- One continuous vertical page
- CSS `scroll-snap-type: y mandatory` on the root container
- Each chapter: `height: 100dvh`, `scroll-snap-align: start`
- Chapter transitions: GSAP ScrollTrigger drives parallax, fade, and background morphing
- Mobile: touch swipe works naturally with scroll-snap
- Keyboard: `PageDown` / `PageUp` advances chapters

### The tire is the data
The car's four tires change color and glow based on the current lap's severity:

| Severity | Tire Color | Glow |
|---|---|---|
| 0 | `#00E676` green | Soft steady pulse |
| 1 | `#FFD600` yellow | Gentle pulse |
| 2 | `#FF6D00` amber | Active pulse |
| 3 | `#FF1744` red | Intense pulsing bloom, `glow-pulse` CSS animation |

This single visual element communicates the model's primary output without any text needed.

### Dual-audience: layered reveal
Every chapter shows **plain-English explanation by default**. A `[ + Technical ]` button in the lower-right corner of each chapter's content area expands a technical details panel inline.

- Non-technical visitors: read the story, understand the insight, never see a number they didn't ask for
- Engineers / ML reviewers: tap `[ + Technical ]` to see raw SHAP values, model notes, confidence scores, methodology caveats
- The toggle state persists across chapters (if you expand technical in ch2, ch3 opens expanded too)

### Intent: portfolio showcase
This is a public portfolio piece demonstrating a complete ML engineering project. Both audiences matter:
- General visitors get the F1 narrative
- Technical reviewers see the ML rigor (XGBoost, SHAP, weak supervision, heuristic labels)

---

## 3. Visual Language

### Colors
| Token | Value | Use |
|---|---|---|
| `--bg` | `#080808` | Page background |
| `--surface` | `#111111` | Panel backgrounds |
| `--border` | `#1e1e1e` | Subtle dividers |
| `--mclaren` | `#FF8000` | Primary accent, CTA |
| `--sev-0` | `#00E676` | Severity 0 — fresh |
| `--sev-1` | `#FFD600` | Severity 1 — nominal |
| `--sev-2` | `#FF6D00` | Severity 2 — high |
| `--sev-3` | `#FF1744` | Severity 3 — critical |
| `--text-primary` | `#EEEEEE` | Main text |
| `--text-muted` | `#666666` | Labels, captions |
| `--shap-pos` | `#FF8000` | Positive SHAP contribution |
| `--shap-neg` | `#2979FF` | Negative SHAP contribution |

### Typography
| Role | Font | Weight | Notes |
|---|---|---|---|
| Hero numbers, chapter headings | `Rajdhani` | 700–900 | Condensed, F1-appropriate |
| Body copy, plain-English explanations | `DM Sans` | 400–600 | Clean, readable |
| Data values, SHAP numbers, technical labels | `Fira Code` | 400 | Monospace |

All loaded via Google Fonts. Fallback: `system-ui`.

### Animation library
- **Anime.js v4** — counter animations, stagger bar entrances, logo character drop-ins
- **GSAP + ScrollTrigger** — scroll-driven parallax, chapter background morphing, car position tracking
- **CSS animations** — tire glow pulse (`@keyframes glow-pulse`), pit-window pulse
- Use `prefers-reduced-motion` media query to disable all animations

### Car SVG
Inline SVG, top-down view. Four tires as separate `<ellipse>` elements with:
- `stroke` driven by severity color CSS variable
- `filter: drop-shadow()` for glow effect
- Scale and opacity transitions via GSAP

---

## 4. Persistent UI Elements

### Lap scrubber (always visible, pinned bottom)
- Height: `48px`, position: `fixed bottom: 0 left: 0 right: 0`
- `z-index: 50`
- Background: `rgba(8,8,8,0.95)` + `backdrop-filter: blur(8px)`
- Contents (left to right):
  - `LAP 38 / 52` in Fira Code, small
  - `‹` prev button
  - Range input, full width, orange accent
  - `›` next button
- Keyboard: `←` `→` arrows change lap
- On lap change: all animated values in current chapter update (counter, bars, tire glow, car position in ch4)

### Chapter progress dots (vertical, right edge)
- 5 dots, right-center of viewport, `position: fixed right: 16px`
- Active dot: `#FF8000` filled
- Inactive: `#222` filled, `#333` border
- Clicking a dot scrolls to that chapter (`scrollIntoView({ behavior: 'smooth' })`)

### Settings (year + driver)
- Small `⚙` icon, top-right corner, `position: fixed`
- Opens a minimal popover (not a full modal)
- Year pills: 2021 2022 2023 2024 2025
- Driver pills: derived from `getDriversForYear(year)`
- Selecting triggers crossfade of all data (existing `crossFadeThen` pattern)

---

## 5. Chapter Specifications

### Chapter 1 — Hero: Scene-Setting

**Background:**
- Pure `#080808`
- Silverstone circuit SVG path fades in on load via `stroke-dashoffset` animation (~1.5s, ease-out)
- Circuit at ~12% opacity, `#00ff88` stroke
- Radial spotlight centered on car position

**Car:**
- Centered, top-down
- Tires green (fresh — this is lap 1 framing regardless of selected lap, to establish the "before" state)
- Slow continuous circuit-loop animation (GSAP `motionPath` following the circuit SVG path, duration ~12s, repeat -1)

**Content:**
```
[top-center]
LATENTLAP-AI                          ← Rajdhani 700, 48px, #FF8000
                                          Letter stagger drop-in on load (animejs)
McLaren · Silverstone · 2024          ← DM Sans 12px, #666, uppercase, tracking-widest
                                          (year from RaceContext)
[bottom-center]
NORRIS · LAP 1 OF 52                  ← Fira Code 11px, #555

[scroll hint]
↓  scroll to begin                    ← pulses every 3s, fades after first scroll
```

**Plain-English explanation (always visible):**
> "This dashboard reconstructs what happened inside McLaren's tires during a race — lap by lap — using AI trained on public F1 telemetry. Scroll to explore."

**Technical panel (+ Technical):**
> Model: XGBoost classifier, 18-inch Pirelli era (2021–2025). Labels generated via weak supervision heuristics (not physical tire sensors). Features: sector times, lateral G, tire age, air/track temperature, driving aggression index.

---

### Chapter 2 — Severity + Mode: "How Bad Is It?"

**Background:**
- Radial gradient bleeds from `#1a0500` (center) → `#080808` (edges), intensity scales with severity
- Two large soft heat-bloom circles pulse behind front/rear tire positions
  - Severity 0: no bloom
  - Severity 1: faint amber bloom, low opacity
  - Severity 2: orange bloom, medium opacity, 2s pulse cycle
  - Severity 3: red bloom, high opacity, 1.2s pulse cycle (matches existing `glow-pulse`)
- Faint rubber streak marks appear on the background at severity 2+ (static SVG paths, fade in)

**Car:**
- Centered, tires colored by severity
- Severity 3: car vibrates slightly (GSAP `x` oscillation ±1px, 80ms)

**Content layout:**

```
[above car — centered]
                    2                 ← Rajdhani 900, 120px, severity color
                   / 3                ← Rajdhani 40px, #444
              HIGH DEGRADATION        ← DM Sans 11px uppercase, severity color

[plain-English explanation]
  "Our model rates this lap as HIGH DEGRADATION — the tires are under
   significant stress. Think of it like a phone battery at 30%: still
   running, but degrading faster with every lap."

[below car — 4 mode bars]
  FAILURE MODE BREAKDOWN
  ┌─────────────────────────────────────────┐
  │ Thermal       ████████████░░░░   74.3%  │  ← dominant: #FF8000
  │ Blistering    ████░░░░░░░░░░░░   18.2%  │  ← #666
  │ Wear          ██░░░░░░░░░░░░░░    6.1%  │  ← #666
  │ No Failure    ░░░░░░░░░░░░░░░░    1.4%  │  ← #666
  └─────────────────────────────────────────┘

[+ Technical panel]
  DegSeverity: 2 (heuristic proxy — not a physical sensor)
  mode_probs: { thermal: 0.743, blistering: 0.182, wear: 0.061, none: 0.014 }
  Dominant mode: Thermal (confidence 0.743)
  Note: severity thresholds are empirical (TyreLife > 20 laps + lapDelta > +0.8s)
```

**Animations on chapter entry:**
- Severity number counts up from 0 → current value (animejs counter, `outExpo`, 600ms)
- Mode bars animate width from 0% → actual width (animejs, stagger 40ms)
- Heat bloom fades in over 400ms

**Animations on lap change (from scrubber):**
- Number re-counts from previous value to new value
- Bars reanimate
- Tire glow crossfades to new severity color (200ms)
- Background heat intensity adjusts

---

### Chapter 3 — Top Predictors: "Why Does the AI Think That?"

**Background:**
- Dark `#060a0e` base
- Silverstone circuit SVG, `8% opacity`, `#FF8000` stroke
- Specific corner zones light up as radial glow blobs, color = positive (orange) or negative (blue) SHAP direction
  - Zone positions are pre-mapped to circuit coordinates:
    - `MB` (Maggotts-Becketts): left-center of circuit
    - `Copse`: top-right
    - `Stowe`: bottom-left
    - `Club`: bottom-center
  - Blob size = relative SHAP magnitude
  - Only the top 3 features light their zones

**Car:**
- Positioned near the top SHAP feature's circuit zone
- Rotated ~20–30° as if taking that corner
- Subtle motion blur trail (short SVG line behind rear, low opacity)

**Content:**

```
[top-left overlay]
TOP PREDICTORS — LAP 38              ← Fira Code 9px, #FF8000, uppercase

[3 SHAP rows, staggered entrance]
┌──────────────────────────────────────────────────────┐
│  Maggotts-Becketts G-Force                           │
│  ████████████████████████████░░░░░  +0.047   [zone]  │  ← orange bar
│  "High lateral force through the fast chicane        │
│   is the main driver of this lap's tire stress."     │
├──────────────────────────────────────────────────────┤
│  Tyre Age (laps)                                     │
│  ████████████████████░░░░░░░░░░░░░  +0.031   [zone]  │  ← orange bar
│  "The tire is 22 laps old — older tires degrade      │
│   faster under the same forces."                     │
├──────────────────────────────────────────────────────┤
│  Track Temperature                                   │
│  ██████████████░░░░░░░░░░░░░░░░░░░  -0.023   [zone]  │  ← blue bar (negative)
│  "Cooler track today is slightly reducing stress     │
│   compared to an average Silverstone day."           │
└──────────────────────────────────────────────────────┘

[+ Technical panel]
  Top SHAP (TreeExplainer, lap 38):
  MB_PeakLatG: +0.047  |  TyreLife: +0.031  |  TrackTemp: -0.023
  Full feature set: MB_PeakLatG, MB_TimeSec, Copse_PeakLatG, Copse_TimeSec,
                    Club_TimeSec, Stowe_PeakLatG, TyreLife, AirTemp,
                    TrackTemp, AggressionZ
  SHAP baseline (expected value): ~1.12
```

**Animations:**
- Corner zone blobs fade in sequentially (stagger 200ms) as chapter enters
- 3 SHAP rows drop in with stagger 60ms (animejs `translateY: [12, 0]` + `opacity: [0, 1]`)
- Bars draw left-to-right (animejs `scaleX: [0, 1]`, `transformOrigin: left`)
- On lap change: bars re-animate, zone sizes adjust, car repositions

---

### Chapter 4 — Race Arc: "The Whole Race at Once"

**Background:**
- Abstract timeline-as-racetrack
- Full-width horizontal bands per lap, vertically stacked top (lap 1) to bottom (final lap)
- Each band is `100% width`, `height: 100dvh / totalLaps`, colored by severity
- Pit stops: a full-width 1px line in `#FF8000`, label `⏹ PIT L{n}` in tiny orange
- Two faint vertical lane-marking lines (CSS repeating gradient, very low opacity) create a road feel
- The current lap's band has a subtle horizontal highlight: `rgba(255,255,255,0.04)` + left `2px` orange border

**Car:**
- Top-down, centered horizontally
- Vertical position: `(currentLap / totalLaps) * 100dvh` from top
- GSAP `ScrollTrigger` + `scrubber` interaction: dragging the lap scrubber animates the car's `y` position up and down the page. This is the most visceral interaction in the entire experience.
- At severity 3 laps: car has subtle shake

**Content:**

```
[top-center]
RACE ARC · {totalLaps} LAPS           ← Fira Code 9px, #4a7a4a, uppercase

[beside car — small callout]
→ LAP 38 · SEV 2 · THERMAL           ← Fira Code 10px, right of car

[bottom-center]
● Fresh  ● Nominal  ● High  ● Critical    ← legend, 8px dots

[plain-English explanation — top overlay, semi-transparent]
  "This is the story of the tires across all {n} laps.
   Drag the scrubber below to drive through the race."

[+ Technical panel]
  Stint 1: L1–L27 (27 laps), severity trend avg: +0.08/lap
  Pit L28. Stint 2: L28–L52 (25 laps), recovery to sev ~1.2 by L35
  lapDelta chart overlaid at 15% opacity (area, #FF8000)
```

**Animations:**
- On chapter entry: lap bands fade in from 0 opacity staggered top-to-bottom (fast, ~300ms total)
- Pit marker line slides in from left
- Car appears at current lap's vertical position
- Scrubber drag: car `y` animates with GSAP `quickSetter` (no lag)

---

### Chapter 5 — Pit Strategy: "When Should They Have Pitted?"

**Background:**
- `#060a06` base
- Pit lane band slides up from bottom on chapter entry: `height: 80px`, dark asphalt texture (`#0d150d`), top border `#1e2e1e`
- Within the pit lane: horizontal bars per pit-lap scenario, colored by recommendation
  - `optimal`: `#00E676` green
  - `acceptable`: `#FFD600` yellow
  - `late`: `#FF6D00` orange
  - `critical`: `#FF1744` red
- Primary pit window: subtle green glow overlay spanning optimal bars, left+right `1px` green borders
- Faint circuit above pit lane, `8% opacity`

**Car:**
- Just above the pit lane entry
- Rotated 90° (pointing into the pit lane)
- At optimal laps: tires glow fresh green (post-pit state)
- `PIT WINDOW OPEN` badge pulses on the car's nose if currentLap is in the window

**Content:**

```
[top]
PIT STRATEGY                           ← Fira Code 9px, #00E676

[center — large]
OPTIMAL WINDOW: LAP 28–33            ← Rajdhani 700, 32px, #00E676
Current: Lap 38 · {inside/outside} window

[confidence badge]
HIGH CONFIDENCE                       ← DM Sans 11px, colored

[if in pit window]
█ PIT WINDOW OPEN █                   ← #FF8000, animated pulse

[pit lane bar chart — no axes, bars labeled with lap numbers below]

[plain-English explanation]
  "Each bar shows how stressed the tires would be at the race end
   if McLaren had pitted on that lap. Green bars are the sweet spot.
   Pitting on lap 28 gives the lowest predicted finish severity."

[+ Technical panel]
  primary_pit_window: { start: 28, end: 33 }
  confidence: "high"
  Optimal: pit_lap=28, finish_severity=0.847
  Model: strategy.py projects DegSeverity forward from pit lap using
  stint-2 degradation rates fitted per year/driver/compound.
  Heuristic — not derived from tire physics simulation.
```

**Animations:**
- Pit lane slides up from `translateY(80px)` → `translateY(0)` on chapter entry
- Bars grow upward from 0 with stagger 30ms (animejs)
- Window highlight glow fades in last (~200ms delay)

---

## 6. Routing & Data

No routing changes. Single-page Next.js app (`app/page.tsx`).

### Unchanged data layer
- `lib/data.ts`: `getLap()`, `getAllLapsForDriver()`, `getSHAP()` — no changes
- `lib/severityColors.ts`: `getSeverityHex()`, `getSeverityLabel()` — no changes
- `app/RaceContext.tsx`: state management — no changes, add `isTechnicalMode: boolean` state
- `/public/data/` JSON files: untouched

### New state
```typescript
// Add to RaceContext:
isTechnicalMode: boolean
setIsTechnicalMode: (v: boolean) => void
```

---

## 7. Component Map

### New components (replace existing)
| New Component | Replaces | Notes |
|---|---|---|
| `ChapterContainer.tsx` | `page.tsx` layout | Scroll-snap root, progress dots, scrubber |
| `CarTopDown.tsx` | `Track3D.tsx` | SVG car, tire color prop, GSAP-animated position |
| `HeroChapter.tsx` | `Header.tsx` | Chapter 1 |
| `SeverityChapter.tsx` | `TireHealth.tsx` | Chapter 2, merged with mode bars |
| `PredictorsChapter.tsx` | `ShapPanel.tsx` | Chapter 3, with plain-English per feature |
| `RaceArcChapter.tsx` | `Timeline.tsx` | Chapter 4, background-as-chart |
| `StrategyChapter.tsx` | `StrategyAdvisor.tsx` | Chapter 5, chart-only |
| `TechnicalPanel.tsx` | — | New: expandable technical detail drawer |
| `LapScrubberFixed.tsx` | `LapScrubber.tsx` | Fixed-position, persists across all chapters |

### Deleted components
- `SeverityBadgeCard.tsx` — replaced by `SeverityChapter`

---

## 8. Animation Contracts

### Animejs v4 patterns (from existing codebase — keep consistent)
```typescript
// Counter (use existing pattern)
animate(counterRef.current, { value: newVal, modifier: utils.round(0), ease: 'outExpo', duration: 600 })

// Bar entrance stagger
animate(barEls, { scaleX: [0, 1], transformOrigin: ['left center'], ease: 'outQuart', duration: 240, delay: stagger(40) })

// Text drop-in stagger (hero)
animate(charEls, { translateY: [20, 0], opacity: [0, 1], ease: 'outQuart', duration: 240, delay: stagger(30) })
```

### GSAP ScrollTrigger (new)
```typescript
// Chapter background parallax
ScrollTrigger.create({ trigger: chapterEl, start: 'top top', end: 'bottom top', scrub: true,
  onUpdate: (self) => { /* morph background based on self.progress */ }
})

// Car vertical position in ch4
gsap.to(carEl, { y: targetY, duration: 0.3, ease: 'power2.out' }) // called on lap change
```

### Tire glow (CSS + GSAP)
```css
/* In globals.css — existing */
@keyframes glow-pulse { 0%,100%{filter:drop-shadow(0 0 6px var(--tire-color))} 50%{filter:drop-shadow(0 0 18px var(--tire-color))} }
```

---

## 9. Accessibility

- All animated values have `aria-live="polite"` + `aria-label`
- `prefers-reduced-motion`: disable all GSAP + animejs animations, use `transition: none`
- Keyboard: `←` `→` = lap scrub, `PageDown/Up` = chapter advance, `Tab` = focus management per chapter
- Chapter progress dots: `aria-label="Chapter N of 5"`, keyboard focusable
- `+ Technical` button: `aria-expanded` toggled, `aria-controls` pointing to panel id
- Color is never the sole indicator (severity labels always accompany colors)

---

## 10. What Gets Cut

| Current | Decision | Reason |
|---|---|---|
| `Track3D.tsx` (WebGL) | **Deleted** | Replaced by SVG car. WebGL adds load time, no explanation, unexplained to non-tech |
| Strategy table | **Deleted** | Chart-only is cleaner; table adds no insight over the visual |
| Severity threshold slider | **Deleted** | Jargon-heavy, no clear value for either audience |
| Header nav bar | **Deleted** | Replaced by fixed `⚙` popover + chapter 1 controls |
| `SeverityBadgeCard.tsx` | **Deleted** | Mobile fallback no longer needed |
| Track style A/B/C/D buttons | **Deleted** | Were 3D track style variants — track is gone |

---

## 11. Implementation Notes

### New dependency: GSAP
`gsap` is not currently installed. Add to dashboard:
```bash
npm install gsap
```
ScrollTrigger and MotionPath are included in GSAP free tier.

### Circuit SVG coordinates
`lib/trackPath.ts` uses `THREE.js` Vector3 for corner positions. Since Track3D is deleted, a new `lib/circuitSvg.ts` must be created with the same waypoints projected to a 2D SVG coordinate space (e.g. viewBox `0 0 200 200`). The existing `SILVERSTONE_WAYPOINTS` 3D `[x, _, z]` values project to SVG `[x, z]` after scaling and centering. `CORNER_POSITIONS` (MB, Copse, Stowe, Club) map to SVG positions for the ch3 glow zones.

### trackPath.ts
Can be deleted after `lib/circuitSvg.ts` is in place — it is only imported by `Track3D.tsx` which is also deleted.

---

## 12. Out of Scope

- No new data pipeline work (all data already generated)
- No new ML features or model changes
- No authentication, no backend changes
- No new data sources — all data from existing `/public/data/` JSON
- No multi-track support (Silverstone only, per project scope)
- No dark/light mode toggle (dark only)
