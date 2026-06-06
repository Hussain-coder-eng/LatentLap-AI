# Sim Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent right-side drawer with a 5-compound selector (SOFT/MEDIUM/HARD/INT/WET) and a split actual-vs-simulation comparison that shows projected finish severity and time delta using client-side heuristic calculation.

**Architecture:** Extend RaceContext with 3 new fields (simCompound, simPitLap, simDrawerOpen). Add computation helpers to lib/data.ts. Build SimDrawer as a self-contained component. Mount in page.tsx alongside a FAB button above LapScrubber.

**Tech Stack:** Next.js 14, React useState/useMemo, TypeScript strict, inline CSS (no new deps).

**Branch:** `feat/sim-drawer` — create before touching any file. Independent of `feat/visual-upgrades`.

---

## File Map

| File | Change |
|---|---|
| `dashboard/lib/data.ts` | Add `CompoundKey`, `COMPOUND_MULTIPLIERS`, `WET_COMPOUNDS`, `getActualPitLap()`, `computeSimResult()` |
| `dashboard/app/RaceContext.tsx` | Add `simCompound`, `simPitLap`, `simDrawerOpen` state + setters |
| `dashboard/app/components/SimDrawer.tsx` | New file — full drawer component |
| `dashboard/app/page.tsx` | Mount `<SimDrawer />` and FAB button |
| `dashboard/tests/e2e/dashboard.spec.ts` | Add SimDrawer test suite |

---

## Task 1: Create feature branch

- [ ] **Step 1: Create and switch to branch**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main
git checkout main
git checkout -b feat/sim-drawer
```

Expected: `Switched to a new branch 'feat/sim-drawer'`

---

## Task 2: Add sim computation helpers to lib/data.ts

**Files:**
- Modify: `dashboard/lib/data.ts`

- [ ] **Step 1: Append compound types and helpers after the existing exports**

Open `dashboard/lib/data.ts`. After `getAllLapsForDriver` (line 66), append:

```typescript
// ── Sim Drawer — compound types and calculation ──────────────────────────────

export type CompoundKey = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET'

export const COMPOUND_MULTIPLIERS: Record<CompoundKey, number> = {
  SOFT:         1.3,
  MEDIUM:       1.0,
  HARD:         0.75,
  INTERMEDIATE: 0.6,
  WET:          0.4,
}

export const WET_COMPOUNDS = new Set<CompoundKey>(['INTERMEDIATE', 'WET'])

export const COMPOUND_COLORS: Record<CompoundKey, string> = {
  SOFT:         '#FF1744',
  MEDIUM:       '#FFD600',
  HARD:         '#e0e0e0',
  INTERMEDIATE: '#00E676',
  WET:          '#2979FF',
}

/**
 * Returns the lap number where the driver pits (first lap_number where stint_id changes 0→1).
 * Falls back to midpoint if no pit found (e.g. no-stop race).
 */
/**
 * Returns the compound used by the driver in stint 2 (post-pit), or 'MEDIUM' if none.
 */
export function getActualStint2Compound(year: number, driver: string): CompoundKey {
  const laps   = getAllLapsForDriver(year, driver)
  const stint2 = laps.find(l => l.stint_id === 1)
  const raw    = stint2?.compound ?? 'MEDIUM'
  const valid: CompoundKey[] = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']
  return valid.includes(raw as CompoundKey) ? (raw as CompoundKey) : 'MEDIUM'
}

export function getActualPitLap(year: number, driver: string): number {
  const laps = getAllLapsForDriver(year, driver)
  for (let i = 0; i < laps.length - 1; i++) {
    if (laps[i].stint_id !== laps[i + 1].stint_id) {
      return laps[i + 1].lap_number
    }
  }
  return Math.ceil(laps.length / 2)
}

export interface SimResult {
  simFinishSeverity:    number
  actualFinishSeverity: number
  timeDeltaSec:         number   // positive = saved time vs actual
  actualPitLap:         number
  actualCompound:       string
  remainingLaps:        number
}

/**
 * Projects finish severity and time delta for a user-chosen compound + pit lap.
 * Uses stint-2 degradation rate from actual data, scaled by compound multiplier.
 * Time delta derived from lap_delta correlation with severity in actual data.
 */
export function computeSimResult(
  year: number,
  driver: string,
  simPitLap: number,
  simCompound: CompoundKey,
): SimResult {
  const laps          = getAllLapsForDriver(year, driver)
  const actualPitLap  = getActualPitLap(year, driver)
  const lastLap       = laps[laps.length - 1]
  const lastLapNum    = lastLap?.lap_number ?? laps.length

  const actualFinishSeverity = lastLap?.severity_pred ?? 0
  const actualCompound       = laps.find(l => l.stint_id === 1)?.compound ?? 'MEDIUM'

  // Severity at sim pit lap (end of user stint 1)
  const stint1Laps            = laps.filter(l => l.lap_number <= simPitLap)
  const stintOneSevAtPit      = stint1Laps[stint1Laps.length - 1]?.severity_pred ?? 0

  // Baseline stint-2 rate from actual data (severity delta / laps)
  const actualStint2Laps = laps.filter(l => l.stint_id === 1)
  let baseDegRate = 0.05
  if (actualStint2Laps.length >= 2) {
    const sevDelta = actualStint2Laps[actualStint2Laps.length - 1].severity_pred
                   - actualStint2Laps[0].severity_pred
    baseDegRate = Math.max(0, sevDelta / actualStint2Laps.length)
  }

  const simDegRate    = baseDegRate * COMPOUND_MULTIPLIERS[simCompound]
  const remainingLaps = Math.max(0, lastLapNum - simPitLap)
  const simFinish     = Math.min(3, stintOneSevAtPit + simDegRate * remainingLaps)

  // lap_delta per severity unit (from actual race laps with severity > 0)
  const nonZero = laps.filter(l => l.severity_pred > 0)
  const avgDeltaPerSev = nonZero.length > 0
    ? nonZero.reduce((s, l) => s + Math.abs(l.lap_delta) / l.severity_pred, 0) / nonZero.length
    : 0.3

  const severityDiff = actualFinishSeverity - simFinish
  const timeDeltaSec = severityDiff * avgDeltaPerSev * remainingLaps

  return {
    simFinishSeverity:    Math.round(simFinish * 1000) / 1000,
    actualFinishSeverity: Math.round(actualFinishSeverity * 1000) / 1000,
    timeDeltaSec:         Math.round(timeDeltaSec * 10) / 10,
    actualPitLap,
    actualCompound,
    remainingLaps,
  }
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
git commit -m "feat: add sim compound types and computeSimResult helper"
```

---

## Task 3: Extend RaceContext with sim state

**Files:**
- Modify: `dashboard/app/RaceContext.tsx`

- [ ] **Step 1: Add sim fields to the context**

Replace the full content of `dashboard/app/RaceContext.tsx` with:

```typescript
// app/RaceContext.tsx
'use client'
import { createContext, useContext, useState, useMemo, ReactNode } from 'react'
import { getLapRange, getActualPitLap, getActualStint2Compound, type CompoundKey } from '../lib/data'

export interface RaceContextValue {
  currentLap: number
  currentYear: number
  currentDriver: string
  activePanelId: string | null
  topSHAPFeature: string | null
  trackStyle: 'A' | 'B' | 'C' | 'D'
  isTechnicalMode: boolean
  simCompound: CompoundKey
  simPitLap: number
  simDrawerOpen: boolean
  setCurrentLap: (n: number) => void
  setCurrentYear: (y: number) => void
  setCurrentDriver: (d: string) => void
  setActivePanelId: (id: string | null) => void
  setTopSHAPFeature: (f: string | null) => void
  setTrackStyle: (s: 'A' | 'B' | 'C' | 'D') => void
  setIsTechnicalMode: (v: boolean) => void
  setSimCompound: (c: CompoundKey) => void
  setSimPitLap: (l: number) => void
  setSimDrawerOpen: (v: boolean) => void
}

const RaceContext = createContext<RaceContextValue | null>(null)

const DEFAULT_YEAR   = 2025
const DEFAULT_DRIVER = 'NOR'

export function RaceProvider({ children }: { children: ReactNode }) {
  const [currentLap, setCurrentLap]       = useState(() => getLapRange(DEFAULT_YEAR, DEFAULT_DRIVER)[0])
  const [currentYear, setCurrentYear]     = useState(DEFAULT_YEAR)
  const [currentDriver, setCurrentDriver] = useState(DEFAULT_DRIVER)
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [topSHAPFeature, setTopSHAPFeature] = useState<string | null>(null)
  const [trackStyle, setTrackStyle]       = useState<'A' | 'B' | 'C' | 'D'>('A')
  const [isTechnicalMode, setIsTechnicalMode] = useState(false)
  const [simCompound, setSimCompound]     = useState<CompoundKey>(() => getActualStint2Compound(DEFAULT_YEAR, DEFAULT_DRIVER))
  const [simPitLap, setSimPitLap]         = useState(() => getActualPitLap(DEFAULT_YEAR, DEFAULT_DRIVER))
  const [simDrawerOpen, setSimDrawerOpen] = useState(false)

  const value = useMemo<RaceContextValue>(() => ({
    currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature,
    trackStyle, isTechnicalMode, simCompound, simPitLap, simDrawerOpen,
    setCurrentLap, setCurrentYear, setCurrentDriver, setActivePanelId,
    setTopSHAPFeature, setTrackStyle, setIsTechnicalMode,
    setSimCompound, setSimPitLap, setSimDrawerOpen,
  }), [
    currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature,
    trackStyle, isTechnicalMode, simCompound, simPitLap, simDrawerOpen,
  ])

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceContextValue {
  const ctx = useContext(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used inside <RaceProvider>')
  return ctx
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
git add dashboard/app/RaceContext.tsx
git commit -m "feat: extend RaceContext with simCompound, simPitLap, simDrawerOpen"
```

---

## Task 4: Build SimDrawer component

**Files:**
- Create: `dashboard/app/components/SimDrawer.tsx`

- [ ] **Step 1: Create the file with full implementation**

Create `dashboard/app/components/SimDrawer.tsx`:

```typescript
'use client'
import { useMemo } from 'react'
import { useRaceContext } from '../RaceContext'
import {
  computeSimResult,
  getAllLapsForDriver,
  COMPOUND_MULTIPLIERS,
  COMPOUND_COLORS,
  WET_COMPOUNDS,
  type CompoundKey,
} from '../../lib/data'

const ALL_COMPOUNDS: CompoundKey[] = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']

export default function SimDrawer() {
  const {
    currentYear, currentDriver,
    simCompound, simPitLap, simDrawerOpen,
    setSimCompound, setSimPitLap, setSimDrawerOpen,
  } = useRaceContext()

  const laps      = getAllLapsForDriver(currentYear, currentDriver)
  const lapNums   = laps.map(l => l.lap_number)
  const minLap    = lapNums.length > 0 ? Math.min(...lapNums) + 1 : 2
  const maxLap    = lapNums.length > 0 ? Math.max(...lapNums) - 1 : 50

  const result = useMemo(
    () => computeSimResult(currentYear, currentDriver, simPitLap, simCompound),
    [currentYear, currentDriver, simPitLap, simCompound]
  )

  const isWet        = WET_COMPOUNDS.has(simCompound)
  const timeSaved    = result.timeDeltaSec
  const verdictPos   = timeSaved > 0
  const verdictLabel = verdictPos
    ? `SAVED ${timeSaved.toFixed(1)}s`
    : `LOST ${Math.abs(timeSaved).toFixed(1)}s`

  if (!simDrawerOpen) return null

  return (
    <div
      data-testid="sim-drawer"
      aria-label="Strategy simulator"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 320,
        height: '100dvh',
        background: '#0d1117',
        borderLeft: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        color: '#e0e0e0',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: '#FF8000' }}>
          LATENTLAP SIM
        </span>
        <button
          aria-label="Close simulator"
          onClick={() => setSimDrawerOpen(false)}
          style={{
            background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18,
          }}
        >
          ✕
        </button>
      </div>

      {/* Controls */}
      <div style={{ padding: '16px 16px 0' }}>
        {/* Compound selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, letterSpacing: 1 }}>
            COMPOUND
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_COMPOUNDS.map(c => (
              <button
                key={c}
                aria-pressed={simCompound === c}
                onClick={() => setSimCompound(c)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${simCompound === c ? COMPOUND_COLORS[c] : 'rgba(255,255,255,0.15)'}`,
                  background: simCompound === c ? `${COMPOUND_COLORS[c]}22` : 'transparent',
                  color: simCompound === c ? COMPOUND_COLORS[c] : '#888',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  fontWeight: simCompound === c ? 700 : 400,
                }}
              >
                {c === 'INTERMEDIATE' ? 'INT' : c === 'SOFT' ? 'S' : c === 'MEDIUM' ? 'M' : c === 'HARD' ? 'H' : 'W'}
              </button>
            ))}
          </div>
          {isWet && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#FFD600' }}>
              ⚠ hypothetical — Silverstone {currentYear} was dry
            </div>
          )}
        </div>

        {/* Pit lap slider */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>PIT LAP</span>
            <span style={{ fontSize: 12, color: '#FF8000', fontWeight: 700 }}>L{simPitLap}</span>
          </div>
          <input
            aria-label="Sim pit lap"
            type="range"
            min={minLap}
            max={maxLap}
            value={simPitLap}
            onChange={e => setSimPitLap(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#FF8000' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 9, color: '#555' }}>L{minLap}</span>
            <span style={{ fontSize: 9, color: '#555' }}>L{maxLap}</span>
          </div>
        </div>
      </div>

      {/* Split comparison */}
      <div style={{ padding: '0 16px', flex: 1 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {/* Column header */}
          {['ACTUAL', 'YOUR SIM'].map((label, i) => (
            <div key={label} style={{
              padding: '8px 12px',
              background: i === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,128,0,0.08)',
              borderRight: i === 0 ? '1px solid rgba(255,255,255,0.08)' : undefined,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              color: i === 0 ? '#888' : '#FF8000',
            }}>
              {label}
            </div>
          ))}

          {/* Row: Compound */}
          <Cell label="Compound" value={result.actualCompound} isLeft />
          <Cell label="Compound" value={simCompound === 'INTERMEDIATE' ? 'INT' : simCompound} />

          {/* Row: Pit Lap */}
          <Cell label="Pit Lap" value={`L${result.actualPitLap}`} isLeft />
          <Cell label="Pit Lap" value={`L${simPitLap}`} />

          {/* Row: Finish Severity */}
          <Cell label="Finish Sev" value={result.actualFinishSeverity.toFixed(2)} isLeft />
          <Cell
            label="Finish Sev"
            value={result.simFinishSeverity.toFixed(2)}
            highlight={result.simFinishSeverity < result.actualFinishSeverity ? '#00E676' : '#FF1744'}
          />

          {/* Row: Δ/lap */}
          <Cell label="Multiplier" value="×1.00" isLeft />
          <Cell
            label="Multiplier"
            value={`×${COMPOUND_MULTIPLIERS[simCompound].toFixed(2)}`}
          />
        </div>
      </div>

      {/* Verdict */}
      <div style={{ padding: 16 }}>
        <div style={{
          border: `1px solid ${verdictPos ? '#00E676' : '#FF1744'}`,
          borderRadius: 6,
          padding: '12px 16px',
          textAlign: 'center',
          background: verdictPos ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)',
        }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: verdictPos ? '#00E676' : '#FF1744',
            letterSpacing: 1,
          }}>
            {verdictPos ? '✓' : '✗'} {verdictLabel}
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
            vs actual strategy · {result.remainingLaps} laps projected
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({
  label, value, isLeft = false, highlight,
}: {
  label: string
  value: string
  isLeft?: boolean
  highlight?: string
}) {
  return (
    <div style={{
      padding: '10px 12px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      borderRight: isLeft ? '1px solid rgba(255,255,255,0.08)' : undefined,
      background: isLeft ? 'rgba(255,255,255,0.02)' : 'transparent',
    }}>
      <div style={{ fontSize: 9, color: '#555', marginBottom: 2, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: highlight ?? '#e0e0e0' }}>{value}</div>
    </div>
  )
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
git add dashboard/app/components/SimDrawer.tsx
git commit -m "feat: add SimDrawer component with compound selector and split sim"
```

---

## Task 5: Mount SimDrawer and FAB in page.tsx

**Files:**
- Modify: `dashboard/app/page.tsx`

- [ ] **Step 1: Replace page.tsx content**

```typescript
'use client'
import { RaceProvider, useRaceContext } from './RaceContext'
import ScrollStage from './components/ScrollStage'
import { Speedometer } from './components/Speedometer'
import LapScrubberFixed from './components/LapScrubberFixed'
import SettingsPopover from './components/SettingsPopover'
import SimDrawer from './components/SimDrawer'

function SimFAB() {
  const { simDrawerOpen, setSimDrawerOpen } = useRaceContext()
  return (
    <button
      data-testid="sim-fab"
      aria-label="Open strategy simulator"
      onClick={() => setSimDrawerOpen(!simDrawerOpen)}
      style={{
        position: 'fixed',
        bottom: 88,
        right: 16,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: simDrawerOpen ? '#FF8000' : '#1a1f24',
        border: '1px solid rgba(255,128,0,0.6)',
        color: simDrawerOpen ? '#000' : '#FF8000',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 700,
        cursor: 'pointer',
        zIndex: 150,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        letterSpacing: 0.5,
      }}
    >
      SIM
    </button>
  )
}

export default function DashboardPage() {
  return (
    <RaceProvider>
      <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
        <Speedometer />
        <SettingsPopover />
        <ScrollStage />
        <LapScrubberFixed />
        <SimFAB />
        <SimDrawer />
      </div>
    </RaceProvider>
  )
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
git add dashboard/app/page.tsx
git commit -m "feat: mount SimDrawer and SIM FAB button in page"
```

---

## Task 6: Add Playwright tests for SimDrawer

**Files:**
- Modify: `dashboard/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Append SimDrawer test suite at bottom of the file**

Add before the final `})` or at the very end:

```typescript
// ── SimDrawer ─────────────────────────────────────────────────────────────────

test.describe('SimDrawer', () => {
  test('SIM FAB is visible', async ({ page }) => {
    const fab = page.getByTestId('sim-fab')
    await expect(fab).toBeVisible()
  })

  test('drawer is hidden by default', async ({ page }) => {
    const drawer = page.getByTestId('sim-drawer')
    await expect(drawer).not.toBeAttached()
  })

  test('drawer opens on FAB click', async ({ page }) => {
    await page.getByTestId('sim-fab').click()
    const drawer = page.getByTestId('sim-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText('LATENTLAP SIM')
  })

  test('drawer closes via ✕ button', async ({ page }) => {
    await page.getByTestId('sim-fab').click()
    await expect(page.getByTestId('sim-drawer')).toBeVisible()
    await page.getByRole('button', { name: 'Close simulator' }).click()
    await expect(page.getByTestId('sim-drawer')).not.toBeAttached()
  })

  test('compound chips are selectable', async ({ page }) => {
    await page.getByTestId('sim-fab').click()
    const drawer = page.getByTestId('sim-drawer')
    // Click HARD chip
    await drawer.getByRole('button', { name: 'H' }).click()
    await expect(drawer.getByRole('button', { name: 'H' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('pit lap slider is present and interactive', async ({ page }) => {
    await page.getByTestId('sim-fab').click()
    const slider = page.getByLabel('Sim pit lap')
    await expect(slider).toBeVisible()
    const min = Number(await slider.getAttribute('min'))
    const max = Number(await slider.getAttribute('max'))
    expect(min).toBeGreaterThanOrEqual(2)
    expect(max).toBeGreaterThan(min)
  })

  test('verdict chip renders', async ({ page }) => {
    await page.getByTestId('sim-fab').click()
    const drawer = page.getByTestId('sim-drawer')
    const text = await drawer.textContent()
    expect(text).toMatch(/SAVED|LOST/)
  })

  test('INT compound shows hypothetical warning', async ({ page }) => {
    await page.getByTestId('sim-fab').click()
    const drawer = page.getByTestId('sim-drawer')
    await drawer.getByRole('button', { name: 'INT' }).click()
    await expect(drawer).toContainText('hypothetical')
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npx playwright test tests/e2e/dashboard.spec.ts --reporter=line 2>&1 | tail -40
```

Expected: all tests pass including new SimDrawer suite.

- [ ] **Step 3: Commit**

```bash
git add dashboard/tests/e2e/dashboard.spec.ts
git commit -m "test: add SimDrawer e2e test suite"
```

---

## Task 7: Build verification

- [ ] **Step 1: Full Next.js build**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully`, no TypeScript errors.

- [ ] **Step 2: Report done**

Report branch `feat/sim-drawer` ready for code review and merge.
