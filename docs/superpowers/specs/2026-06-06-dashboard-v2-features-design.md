# Dashboard v2 Features — Design Spec
**Date:** 2026-06-06  
**Status:** Approved  
**Scope:** 4 new features for LatentLap-AI dashboard (Next.js 14, GSAP, Silverstone 2021–2025)

---

## Overview

Four independent features split across two parallel implementation branches:

- **Branch 1 — Visuals:** Car continuous loop + Per-corner SHAP glow
- **Branch 2 — Interaction:** Compound selector + Split sim drawer

---

## Feature 1 — Car Continuous Loop

### What
Replace the current lap-position teleport with a continuous GSAP motion path animation that loops the car around the full Silverstone circuit indefinitely, on all 4 chapters.

### Current behaviour
`SilverstoneCircuit.tsx` computes `lapToCircuitProgress(currentLap, maxLapNum)`, calls `pathEl.getPointAtLength(dist)`, and sets `transform` on the car `<g>` element. Car jumps to position on lap change.

### New behaviour
- On mount, run a GSAP `gsap.to()` tween on a `{ t: 0 }` proxy object, tweening `t` from `0` to `1`, `duration: 8`, `repeat: -1`, `ease: 'none'`
- Each tick: compute `point = pathEl.getPointAtLength(t * totalLength)` and apply the existing tangent rotation math (already correct in codebase)
- Remove the `currentLap`-driven `useEffect` that sets car position
- Car is now purely a visual looping element — not a race position indicator
- Active on all chapters (no `activeChapter` gate)

### Files changed
- `dashboard/app/components/SilverstoneCircuit.tsx` — replace position useEffect with GSAP loop

---

## Feature 2 — Per-Corner SHAP Glow with Deg Type Breakdown

### What
Each of the 4 Silverstone corners (MB, Copse, Stowe, Club) shows a dynamic glow circle encoding:
1. **Severity magnitude** — how much that corner contributes to this lap's degradation
2. **Deg type breakdown** — blistering vs thermal vs wear, as arc segments

Only active on Chapter 2 (Top Predictors). Replaces the current static 4-circle render.

### Data source
`shap_values.severity[key]` from `shap_data.json`. Per lap, per corner, summed from prefixed features:
- `MB_*`, `Copse_*`, `Stowe_*`, `Club_*`

### Corner score computation (in component)
```ts
const CORNER_PREFIXES = ['MB', 'Copse', 'Stowe', 'Club'] as const

// Feature → deg type mapping
const FEATURE_TYPE: Record<string, 'blister' | 'thermal' | 'wear'> = {
  PeakLatG: 'blister', AvgLatG: 'blister',
  TimeSec: 'thermal',
  BrakeFraction: 'wear', EntrySpeed: 'wear',
}

function getCornerBreakdown(shap: SHAPEntry, prefix: string) {
  let blister = 0, thermal = 0, wear = 0, total = 0
  for (const [key, val] of Object.entries(shap)) {
    if (!key.startsWith(prefix + '_')) continue
    const suffix = key.slice(prefix.length + 1)
    const type = FEATURE_TYPE[suffix]
    const abs = Math.abs(val)
    total += abs
    if (type === 'blister') blister += abs
    else if (type === 'thermal') thermal += abs
    else if (type === 'wear') wear += abs
  }
  return { blister, thermal, wear, total }
}
```

### Visual encoding
| Property | Low (score=0) | High (score=1) |
|---|---|---|
| Outer circle radius | 8px | 14px |
| Stroke opacity | 0.35 | 0.95 |
| Base stroke color | `#FF8000` | `#FF1744` |

**Donut arc segments** (SVG `<path>` arcs around the circle):
- Blistering → `#FF1744` (red)
- Thermal → `#FF8000` (orange)  
- Wear → `#FFD600` (yellow)
- Proportional to each type's share of the corner's total SHAP magnitude

**Pulse animation:** corner with score > 0.7 gets a GSAP `gsap.to(el, { scale: 1.15, repeat: -1, yoyo: true, duration: 0.9 })`

**Label:** floating `<text>` above each corner showing `COPSE · BLISTER` (corner name + dominant type). Only for the highest-score corner; others show name only.

**Normalization:** all 4 corner totals normalized to 0–1 against the max.

### Files changed
- `dashboard/app/components/SilverstoneCircuit.tsx` — replace static circle render with dynamic glow + arcs
- `dashboard/lib/circuitSvg.ts` — no changes needed (CORNER_SVG positions reused)

---

## Feature 3 — Compound Selector + Split Sim Drawer

### What
Persistent side drawer (slides in from right, 320px wide) with a compound selector and actual-vs-sim comparison. Triggered by a FAB button above the LapScrubber.

### Compounds
| Compound | Chip color | Rate multiplier | Hypothetical flag |
|---|---|---|---|
| SOFT | `#FF1744` red | ×1.3 | — |
| MEDIUM | `#FFD600` yellow | ×1.0 | — |
| HARD | `#e0e0e0` white | ×0.75 | — |
| INTERMEDIATE | `#00E676` green | ×0.6 | ⚠ |
| WET | `#2979FF` blue | ×0.4 | ⚠ |

INT and WET show `⚠ hypothetical` badge — Silverstone 2021–2025 races are dry.

### Drawer layout
```
┌─────────────────────────────────┐
│ LatentLap SIM              ✕   │
├─────────────────────────────────┤
│ Compound  [S] [M] [H] [I] [W]  │
│ Pit Lap   ←————●————→ L24      │
│                                 │
│ ┌──────────┬──────────┐         │
│ │  ACTUAL  │ YOUR SIM │         │
│ ├──────────┼──────────┤         │
│ │ MEDIUM   │ HARD     │ Compound│
│ │ L24      │ L28      │ Pit Lap │
│ │ Sev 1.77 │ Sev 1.42 │ Finish  │
│ │ baseline │ −0.35s/l │ Δ/lap   │
│ └──────────┴──────────┘         │
│                                 │
│  ╔══════════════════════╗       │
│  ║   SAVED 4.2s  ✓     ║       │
│  ╚══════════════════════╝       │
└─────────────────────────────────┘
```

### Calculation
**Actual:** read from `strategy_recommendations.json[year][driver]` — find the entry matching the closest actual pit lap, extract `finish_severity`.

**User sim:**
1. Get stint-1 severity from actual data (all laps before user's chosen pit lap)
2. Get baseline stint-2 degradation rate from actual data (severity/lap slope post-pit)
3. Apply compound multiplier to rate: `simRate = baseRate × compoundMultiplier`
4. Project: `simFinishSeverity = stintStartSeverity + simRate × remainingLaps`

**Time delta:**
- Derive `lapDeltaPerSeverity` from `predictions.json`: `mean(lap_delta) / mean(severity_pred)` for the selected driver/year
- `timeSaved = (actualFinishSeverity − simFinishSeverity) × lapDeltaPerSeverity × remainingLaps`
- Positive = saved time (green verdict), negative = lost time (red verdict)

### State
Extend `RaceContext` with:
```ts
simCompound: CompoundKey   // default: actual compound of current lap (from predictions.json lap.compound)
simPitLap: number          // default: first lap where stint_id changes from 0→1 for current driver/year
simDrawerOpen: boolean
```

### FAB button
Position: `fixed bottom-[88px] right-4` (above existing LapScrubber at bottom). Label: `SIM`. Opens/closes drawer.

### Files changed
- `dashboard/app/RaceContext.tsx` — add sim state
- `dashboard/app/components/SimDrawer.tsx` — new component (drawer + controls + comparison)
- `dashboard/app/page.tsx` — mount `<SimDrawer />` and FAB button

---

## Implementation Branches

### Branch 1: `feat/visual-upgrades`
1. Car continuous GSAP loop (8s, repeat -1)
2. Per-corner SHAP glow + donut arcs

### Branch 2: `feat/sim-drawer`
1. RaceContext sim state
2. SimDrawer component
3. FAB button in page.tsx

Branches are independent — can be dispatched in parallel to Codex.

---

## Data constraints
- No backend: all computation client-side
- No new data files required — all derived from existing `predictions.json`, `shap_data.json`, `strategy_recommendations.json`
- Compound multipliers are heuristic (not model-derived)
- INT/WET projections are counterfactual — must show hypothetical badge

---

## Success criteria
- [ ] Car loops continuously on all chapters, 8s per loop, correct tangent rotation
- [ ] Chapter 2 shows 4 dynamic corner circles with donut arcs (blister/thermal/wear)
- [ ] Highest-score corner pulses and shows `CORNER · TYPE` label
- [ ] SIM drawer opens/closes via FAB
- [ ] All 5 compounds selectable; INT/WET show ⚠ badge
- [ ] Pit lap slider constrained to data range
- [ ] Actual vs sim columns populate from data
- [ ] Verdict chip shows correct time delta (green/red)
- [ ] No TypeScript errors, no console errors
- [ ] Deploys to Vercel production
