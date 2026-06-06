# Visual Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static car position and corner circles with (1) continuous GSAP 8s car loop on all chapters and (2) dynamic per-corner SHAP glow with blistering/thermal/wear donut arc breakdown.

**Architecture:** Add pure computation helpers to `lib/data.ts`, then rewrite both visual systems in `SilverstoneCircuit.tsx`. No new files. No new state. No backend.

**Tech Stack:** Next.js 14, GSAP 3 (dynamic import), animejs 4 (existing draw-in, unchanged), SVG arc math inline, TypeScript strict.

**Branch:** `feat/visual-upgrades` — create before touching any file.

---

## File Map

| File | Change |
|---|---|
| `dashboard/lib/data.ts` | Add `CornerBreakdown`, `getCornerBreakdowns()`, `normalizeCornerScores()` |
| `dashboard/app/components/SilverstoneCircuit.tsx` | Replace position useEffect with GSAP loop; replace static circles with dynamic glow + arcs |
| `dashboard/tests/e2e/dashboard.spec.ts` | Update SilverstoneCircuit test (car now loops, not scrub-driven) |

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Step 1: Create and switch to branch**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main
git checkout -b feat/visual-upgrades
```

Expected: `Switched to a new branch 'feat/visual-upgrades'`

---

## Task 2: Add corner SHAP helpers to lib/data.ts

**Files:**
- Modify: `dashboard/lib/data.ts`

- [ ] **Step 1: Add types and helpers after the existing exports**

Open `dashboard/lib/data.ts`. After the `getAllLapsForDriver` function (line 66), append:

```typescript
// ── Corner SHAP breakdown ────────────────────────────────────────────────────

export type DegType = 'blister' | 'thermal' | 'wear' | 'other'

// Maps feature suffix → degradation type
const SUFFIX_TYPE: Record<string, DegType> = {
  PeakLatG: 'blister',
  AvgLatG:  'blister',
  TimeSec:  'thermal',
  BrakeFraction: 'wear',
  EntrySpeed:    'wear',
}

export interface CornerBreakdown {
  total:    number   // sum of absolute SHAP values for this corner
  blister:  number
  thermal:  number
  wear:     number
  other:    number
  dominant: DegType
}

const CORNER_NAMES = ['MB', 'Copse', 'Stowe', 'Club'] as const

/**
 * Given a lap's SHAP entry, returns per-corner breakdown of degradation type contributions.
 * Only uses severity SHAP (not mode SHAP).
 */
export function getCornerBreakdowns(shap: SHAPEntry): Record<string, CornerBreakdown> {
  const result: Record<string, CornerBreakdown> = {}
  for (const corner of CORNER_NAMES) {
    let blister = 0, thermal = 0, wear = 0, other = 0
    for (const [key, val] of Object.entries(shap)) {
      if (!key.startsWith(corner + '_')) continue
      const suffix = key.slice(corner.length + 1)
      const abs = Math.abs(val)
      const type = SUFFIX_TYPE[suffix] ?? 'other'
      if (type === 'blister') blister += abs
      else if (type === 'thermal') thermal += abs
      else if (type === 'wear') wear += abs
      else other += abs
    }
    const total = blister + thermal + wear + other
    const scores: Record<DegType, number> = { blister, thermal, wear, other }
    const dominant = (Object.keys(scores) as DegType[]).reduce((a, b) =>
      scores[a] >= scores[b] ? a : b
    )
    result[corner] = { total, blister, thermal, wear, other, dominant }
  }
  return result
}

/**
 * Normalizes corner totals to 0–1 against the max corner score.
 */
export function normalizeCornerScores(
  breakdowns: Record<string, CornerBreakdown>
): Record<string, number> {
  const max = Math.max(...Object.values(breakdowns).map(b => b.total))
  const out: Record<string, number> = {}
  for (const [corner, b] of Object.entries(breakdowns)) {
    out[corner] = max > 0 ? b.total / max : 0
  }
  return out
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/lib/data.ts
git commit -m "feat: add corner SHAP breakdown helpers to lib/data"
```

---

## Task 3: Rewrite car animation — continuous GSAP 8s loop

**Files:**
- Modify: `dashboard/app/components/SilverstoneCircuit.tsx`

The goal: replace the `currentLap`-driven position useEffect with a GSAP proxy tween that loops the car along the full path in 8 seconds, indefinitely, on all chapters.

- [ ] **Step 1: Replace the car position useEffect**

In `dashboard/app/components/SilverstoneCircuit.tsx`, find and **replace** the block that starts with:

```typescript
  // Move car to current lap position along the path
  useEffect(() => {
    const pathEl = circuitRef.current
    const carEl = carRef.current
    if (!pathEl || !carEl) return

    const progress = lapToCircuitProgress(currentLap, maxLapNum)
    const totalLength = pathEl.getTotalLength()
    const dist = progress * totalLength
    const point = pathEl.getPointAtLength(dist)
    const half = Math.min(1, totalLength * 0.005)
    const p1 = pathEl.getPointAtLength(Math.max(0, dist - half))
    const p2 = pathEl.getPointAtLength(Math.min(totalLength, dist + half))
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    // Car SVG nose points -Y (up), so Math.atan2(dx, -dy) gives correct forward rotation
    const angleDeg = Math.atan2(dx, -dy) * (180 / Math.PI)
    carEl.setAttribute('transform', `translate(${point.x.toFixed(2)}, ${point.y.toFixed(2)}) rotate(${angleDeg.toFixed(1)}) translate(-6, -11)`)
  }, [currentLap, maxLapNum])
```

Replace it with:

```typescript
  // Continuous GSAP loop — car drives full circuit in 8s, repeat forever
  useEffect(() => {
    if (reducedMotion) return
    const pathEl = circuitRef.current
    const carEl  = carRef.current
    if (!pathEl || !carEl) return

    let tween: { kill: () => void } | null = null

    import('gsap').then(({ default: gsap }) => {
      const proxy = { t: 0 }
      tween = gsap.to(proxy, {
        t: 1,
        duration: 8,
        ease: 'none',
        repeat: -1,
        onUpdate() {
          const totalLength = pathEl.getTotalLength()
          const dist  = proxy.t * totalLength
          const point = pathEl.getPointAtLength(dist)
          const half  = Math.min(1, totalLength * 0.005)
          const p1    = pathEl.getPointAtLength(Math.max(0, dist - half))
          const p2    = pathEl.getPointAtLength(Math.min(totalLength, dist + half))
          const dx    = p2.x - p1.x
          const dy    = p2.y - p1.y
          const angleDeg = Math.atan2(dx, -dy) * (180 / Math.PI)
          carEl.setAttribute(
            'transform',
            `translate(${point.x.toFixed(2)}, ${point.y.toFixed(2)}) rotate(${angleDeg.toFixed(1)}) translate(-6, -11)`
          )
        },
      })
    })

    return () => { tween?.kill() }
  }, [reducedMotion])
```

- [ ] **Step 2: Remove now-unused imports**

Remove `lapToCircuitProgress` from the import line if it is no longer used anywhere else in the file:

```typescript
// Before:
import { buildCircuitPath, lapToCircuitProgress, CORNER_SVG } from '../../lib/circuitSvg'
// After (if lapToCircuitProgress is unused):
import { buildCircuitPath, CORNER_SVG } from '../../lib/circuitSvg'
```

Also remove `getAllLapsForDriver` import and the `allLaps`/`maxLapNum` derived values if they are only used by the removed effect. Check carefully — remove only what is truly unused.

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/components/SilverstoneCircuit.tsx
git commit -m "feat: replace lap-position car with continuous 8s GSAP loop"
```

---

## Task 4: Dynamic corner SHAP glow with donut arcs

**Files:**
- Modify: `dashboard/app/components/SilverstoneCircuit.tsx`

Replace the static corner circle render (the `showCornerGlow && Object.entries(CORNER_SVG).map(...)` block) with dynamic glow circles and SVG donut arcs.

- [ ] **Step 1: Add imports and arc helpers at top of file**

Add to the imports section of `SilverstoneCircuit.tsx`:

```typescript
import { getSHAP, getCornerBreakdowns, normalizeCornerScores, type CornerBreakdown, type DegType } from '../../lib/data'
```

Add these pure helper functions just before the `SilverstoneCircuit` component definition:

```typescript
// ── SVG arc helpers ──────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  if (Math.abs(endAngle - startAngle) < 0.5) return ''
  const s = polarToCartesian(cx, cy, r, startAngle)
  const e = polarToCartesian(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? '1' : '0'
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

const DEG_COLORS: Record<DegType, string> = {
  blister: '#FF1744',
  thermal: '#FF8000',
  wear:    '#FFD600',
  other:   '#888888',
}

const CORNER_LABELS: Record<string, string> = {
  MB:    'MB',
  Copse: 'COPSE',
  Stowe: 'STOWE',
  Club:  'CLUB',
}
```

- [ ] **Step 2: Compute corner data inside the component**

In the `SilverstoneCircuit` component body, add after the existing declarations:

```typescript
  const { currentLap, currentYear, currentDriver } = useRaceContext()
  const shapEntry  = getSHAP(currentYear, currentDriver, currentLap)
  const breakdowns = shapEntry ? getCornerBreakdowns(shapEntry) : null
  const scores     = breakdowns ? normalizeCornerScores(breakdowns) : null
```

(Remove duplicate `useRaceContext` destructuring if already present — merge into one.)

- [ ] **Step 3: Replace static corner circle render**

Find the block:

```typescript
      {/* Corner glow circles — Chapter 2 (Predictors) only */}
      {showCornerGlow &&
        Object.entries(CORNER_SVG).map(([name, pos]) => (
          <circle
            key={name}
            cx={pos.x}
            cy={pos.y}
            r={8}
            fill="none"
            stroke="#FF8000"
            strokeWidth={2}
            opacity={0.45}
          />
        ))}
```

Replace with:

```typescript
      {/* Corner glow circles — Chapter 2 (Predictors) only */}
      {showCornerGlow && breakdowns && scores && (
        <g data-testid="corner-glow-group">
          {Object.entries(CORNER_SVG).map(([name, pos]) => {
            const score = scores[name] ?? 0
            const bd    = breakdowns[name]
            if (!bd) return null

            const r       = 8 + score * 6          // 8–14px
            const opacity = 0.35 + score * 0.6     // 0.35–0.95
            const color   = score > 0.6 ? '#FF1744' : '#FF8000'
            const isPrimary = score === Math.max(...Object.values(scores))

            // Donut arc ring at r+3 outside glow circle
            const arcR = r + 3
            const total = bd.blister + bd.thermal + bd.wear + bd.other
            const arcs: Array<{ type: DegType; startAngle: number; endAngle: number }> = []
            let angle = 0
            for (const type of ['blister', 'thermal', 'wear', 'other'] as DegType[]) {
              const share = total > 0 ? (bd[type] / total) * 360 : 0
              if (share > 1) {
                arcs.push({ type, startAngle: angle, endAngle: angle + share })
              }
              angle += share
            }

            // Label position: above the circle
            const labelY = pos.y - r - 6

            return (
              <g key={name}>
                {/* Glow circle */}
                <circle
                  cx={pos.x} cy={pos.y} r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={opacity}
                />
                {/* Donut arcs */}
                {arcs.map(arc => (
                  <path
                    key={arc.type}
                    d={describeArc(pos.x, pos.y, arcR, arc.startAngle, arc.endAngle)}
                    fill="none"
                    stroke={DEG_COLORS[arc.type]}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                ))}
                {/* Label: always show corner name; primary corner also shows dominant type */}
                <text
                  x={pos.x} y={labelY}
                  textAnchor="middle"
                  fontSize={isPrimary ? 5.5 : 4.5}
                  fill={isPrimary ? '#ffffff' : '#aaaaaa'}
                  fontFamily="monospace"
                  opacity={isPrimary ? 0.9 : 0.55}
                >
                  {isPrimary
                    ? `${CORNER_LABELS[name]} · ${bd.dominant.toUpperCase()}`
                    : CORNER_LABELS[name]
                  }
                </text>
              </g>
            )
          })}
        </g>
      )}
```

- [ ] **Step 4: Wire topFeature prop (remove _ prefix)**

In the component signature, change:

```typescript
export function SilverstoneCircuit({ activeChapter, topFeature: _topFeature }: SilverstoneCircuitProps) {
```

to:

```typescript
export function SilverstoneCircuit({ activeChapter }: SilverstoneCircuitProps) {
```

`topFeature` is now derived inside the component from live SHAP data — no longer needed as a prop. In `ScrollStage.tsx`, remove `topFeature={topFeatureKey}` from the `<SilverstoneCircuit>` JSX. Also remove `topFeature` from the `SilverstoneCircuitProps` interface.

- [ ] **Step 5: Add GSAP pulse for high-severity corners**

High-score corners (score > 0.7) must pulse. Inside the `Object.entries(CORNER_SVG).map(...)` callback in the component, add a `useEffect`-free approach: use a CSS animation via `<style>` injected once, and add the `cornerPulse` class to the glow circle when `score > 0.7`.

Add a `<defs>` or `<style>` block once at the top of the SVG (before the circuit path):

```typescript
      {/* Pulse keyframes for high-severity corners */}
      <defs>
        <style>{`
          @keyframes cornerPulse {
            0%, 100% { transform: scale(1);   opacity: 0.95; }
            50%       { transform: scale(1.18); opacity: 0.6; }
          }
          .corner-pulse {
            animation: cornerPulse 0.9s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: center;
          }
        `}</style>
      </defs>
```

Then on the glow `<circle>`, add `className={score > 0.7 ? 'corner-pulse' : undefined}`:

```typescript
                <circle
                  cx={pos.x} cy={pos.y} r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={opacity}
                  className={score > 0.7 ? 'corner-pulse' : undefined}
                />
```

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add dashboard/app/components/SilverstoneCircuit.tsx dashboard/app/components/ScrollStage.tsx
git commit -m "feat: dynamic per-corner SHAP glow with blistering/thermal/wear donut arcs and pulse"
```

---

## Task 5: Update and add Playwright tests

**Files:**
- Modify: `dashboard/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Update the SilverstoneCircuit test**

The existing test asserts `transform` changes after a lap scrub. With continuous loop, transform always changes. Replace the `SilverstoneCircuit` describe block (lines 89–117) with:

```typescript
test.describe('SilverstoneCircuit', () => {
  test('F1 car marker is visible and animating (continuous loop)', async ({ page }) => {
    const marker = page.getByTestId('circuit-car-marker')
    await expect(marker).toBeAttached()
    await expect(marker).toBeVisible()

    // Car should have a transform set by the GSAP loop within 2s
    await expect.poll(
      () => marker.getAttribute('transform'),
      { timeout: 2000 }
    ).toMatch(/^translate\(/)
  })

  test('corner glow group absent outside chapter 2', async ({ page }) => {
    // Default view is chapter 0 (top of page) — no corner glow
    const glowGroup = page.getByTestId('corner-glow-group')
    await expect(glowGroup).not.toBeVisible()
  })

  test('corner glow group appears in chapter 2 after scroll', async ({ page }) => {
    // Scroll to ~40% of scroll stage to enter chapter 2
    await page.evaluate(() => {
      const stage = document.querySelector('[style*="500vh"]') as HTMLElement | null
      if (stage) window.scrollTo(0, stage.offsetTop + window.innerHeight * 2.5)
    })
    await page.waitForTimeout(600)
    const glowGroup = page.getByTestId('corner-glow-group')
    await expect(glowGroup).toBeAttached()
  })
})
```

- [ ] **Step 2: Run Playwright tests (headless)**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npx playwright test tests/e2e/dashboard.spec.ts --reporter=line 2>&1 | tail -30
```

Expected: all tests pass. If `corner glow group appears in chapter 2` fails due to scroll timing, increase `waitForTimeout` to 1200.

- [ ] **Step 3: Commit**

```bash
git add dashboard/tests/e2e/dashboard.spec.ts
git commit -m "test: update SilverstoneCircuit tests for continuous loop + corner glow"
```

---

## Task 6: Build verification

- [ ] **Step 1: Full Next.js build**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully`, no TypeScript errors, no missing module errors.

- [ ] **Step 2: If build passes — done**

Report branch `feat/visual-upgrades` ready for code review and merge.
