# Phase 6 — Interactive Race Dashboard (`dashboard/`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Run `superpowers:code-reviewer` subagent before any merge to `main`. Use `animejs` skill for any animation question — all code here targets **Anime.js v4** (not v3).

**Goal:** Build a fully-interactive McLaren F1 tire degradation web dashboard (`dashboard/`) that consumes the pre-computed JSON artifacts from Phase 5, renders an animated 3D Silverstone circuit in WebGL, and deploys to Vercel as a static Next.js 14 app.

**Architecture:** Single feature branch `phase-6-dashboard`. Seven groups of work: (1) scaffold, (2) data layer + React Context, (3) components (bottom-up: LapScrubber → Header → TireHealth → ShapPanel → Timeline → Comparison → Track3D), (4) replay hook, (5) final layout integration, (6) Higgsfield asset generation, (7) Vercel deploy. Code review before merge.

**Tech Stack:**
```
Next.js 14 (App Router, output: 'export') → Vercel static hosting
@react-three/fiber + @react-three/drei → 3D WebGL track
animejs v4 → number counters, stagger entrances, replay timeline, SVG draw-on, pit bounce
framer-motion → React component mount animations (panel entrances, spring transitions)
recharts → race timeline BarChart + Comparison AreaChart
Tailwind CSS 3 → layout + utility classes
TypeScript
```

**Anti-patterns (Anime.js v3 patterns that will crash in v4 — BANNED in every file):**
```typescript
// ❌ NEVER:
anime({ targets: el, easing: 'easeOutQuart', ... })
anime.timeline()
anime.stagger()
// ✅ ALWAYS:
import { animate, createTimeline, stagger, utils } from 'animejs'
animate(el, { ease: 'outQuart', ... })
createTimeline({ defaults: { ease: 'outQuart' } })
stagger(40)
```

---

## Part 1 — Branch Setup + Phase 5 Dependency Gate

---

### Task 1: Create branch and verify Phase 5 outputs exist

**Files:** (none created — verification only)

- [ ] **Step 1: Create feature branch**

```bash
git checkout main
git checkout -b phase-6-dashboard
```

Expected: working tree shows `phase-6-dashboard` in `git branch`.

- [ ] **Step 2: Verify Phase 5 JSON artifacts are present**

```bash
ls -lh /Users/hussianaltufayli/Downloads/LatentLap-AI-main/outputs/predictions.json
ls -lh /Users/hussianaltufayli/Downloads/LatentLap-AI-main/outputs/shap_data.json
```

Expected: both files exist and are > 0 bytes. If either is missing, Phase 5 must be run first (`~/.venv/bin/python evaluate.py`). Do NOT proceed until both exist.

- [ ] **Step 3: Confirm `dashboard/public/data/` directory will exist for the copy step**

The copy from `outputs/` to `dashboard/public/data/` happens in Task 3 (after scaffold creates the directory). Note the location now; do not copy yet.

---

## Part 2 — Scaffold

---

### Task 2: Initialise Next.js 14 app with TypeScript, Tailwind, and project config

**Files:**
- `dashboard/package.json`
- `dashboard/next.config.js`
- `dashboard/vercel.json`
- `dashboard/tsconfig.json`
- `dashboard/tailwind.config.ts`
- `dashboard/postcss.config.js`
- `dashboard/styles/globals.css`
- `dashboard/app/layout.tsx`

- [ ] **Step 1: Install all npm packages**

Run from `dashboard/`:

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npm install next@14 react react-dom three @react-three/fiber @react-three/drei
npm install animejs framer-motion recharts
npm install -D @types/three typescript tailwindcss postcss autoprefixer
```

Expected: `node_modules/` populated, no peer-dependency errors. Verify: `cat node_modules/animejs/package.json | grep '"version"'` → should print `"version": "4.x.x"`.

- [ ] **Step 2: Write `next.config.js`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
}
module.exports = nextConfig
```

Gotcha: `output: 'export'` disables all server-side features. No `getServerSideProps`, no API routes, no `next/headers`. All data access is via static JSON imports.

- [ ] **Step 3: Write `vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "out",
  "framework": "nextjs"
}
```

- [ ] **Step 4: Initialise Tailwind**

```bash
npx tailwindcss init -p --ts
```

Update `tailwind.config.ts` content array:

```typescript
content: [
  './app/**/*.{ts,tsx}',
  './lib/**/*.{ts,tsx}',
  './styles/**/*.css',
],
```

- [ ] **Step 5: Write `styles/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Fira+Code:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #090909;
  --surface: #111111;
  --surface-2: #1A1A1A;
  --border: #222222;
  --text-primary: #F0F0F0;
  --text-muted: #666666;
  --mclaren: #FF8000;
  --sev-0: #00E676;
  --sev-1: #FFD600;
  --sev-2: #FF6D00;
  --sev-3: #FF1744;
  --sev-3-glow: 0 0 12px #FF1744, 0 0 24px #FF174466;
  --dur-1: 120ms;
  --dur-2: 180ms;
  --dur-3: 240ms;
  --dur-4: 300ms;
  --dur-5: 500ms;
  --ease-out-quart: cubic-bezier(.165, .84, .44, 1);
  --ease-in-out-cubic: cubic-bezier(.645, .045, .355, 1);
  --ease-out-expo: cubic-bezier(.19, 1, .22, 1);
}

body {
  background-color: var(--bg);
  color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: var(--sev-3-glow); }
  50%       { box-shadow: 0 0 6px #FF1744, 0 0 12px #FF174433; }
}
```

Gotcha: **NEVER use Inter, Roboto, or Space Grotesk.** Rajdhani = HUD/numbers, Fira Code = data labels, DM Sans = body text.

- [ ] **Step 6: Write `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'LatentLap-AI — McLaren Tire Degradation Intelligence',
  description: 'Interactive F1 tire degradation dashboard, Silverstone 2021–2025',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Verify build compiles clean**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npx next build
```

Expected: no TypeScript errors, `out/` directory created.

---

### Task 3: Create directory structure and copy Phase 5 JSON artifacts

**Files:**
- `dashboard/public/data/predictions.json` (copied)
- `dashboard/public/data/shap_data.json` (copied)
- `dashboard/public/media/` (placeholder — assets added in Task 19)

- [ ] **Step 1: Create required directories**

```bash
mkdir -p /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard/public/data
mkdir -p /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard/public/media
mkdir -p /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard/app/components
mkdir -p /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard/lib
```

- [ ] **Step 2: Copy Phase 5 JSON outputs**

```bash
cp /Users/hussianaltufayli/Downloads/LatentLap-AI-main/outputs/predictions.json \
   /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard/public/data/predictions.json

cp /Users/hussianaltufayli/Downloads/LatentLap-AI-main/outputs/shap_data.json \
   /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard/public/data/shap_data.json
```

Expected: files present in `dashboard/public/data/`, each > 0 bytes.

Gotcha: JSON files are loaded via **static import** (not `fetch()`), so they must live in `public/data/` at build time. If Phase 5 is rerun and outputs are updated, this copy step must be repeated before the next build.

---

## Part 3 — Data Layer

---

### Task 4: Write `lib/severityColors.ts`

**Files:**
- `dashboard/lib/severityColors.ts`

```typescript
// lib/severityColors.ts
export const SEVERITY_LABELS = ['Healthy', 'Mild Degradation', 'Moderate Degradation', 'Critical — Blistering*'] as const
export const SEVERITY_CSS_VARS = ['--sev-0', '--sev-1', '--sev-2', '--sev-3'] as const

const SEVERITY_HEX: Record<number, string> = {
  0: '#00E676', 1: '#FFD600', 2: '#FF6D00', 3: '#FF1744',
}

export function getSeverityCSSVar(severity: number): string {
  return SEVERITY_CSS_VARS[Math.min(Math.max(severity, 0), 3)]
}
export function getSeverityHex(severity: number): string {
  return SEVERITY_HEX[Math.min(Math.max(severity, 0), 3)]
}
export function getSeverityLabel(severity: number): string {
  return SEVERITY_LABELS[Math.min(Math.max(severity, 0), 3)]
}
```

Verify: `npx tsc --noEmit` from `dashboard/`.

---

### Task 5: Write `lib/trackPath.ts`

**Files:**
- `dashboard/lib/trackPath.ts`

```typescript
// lib/trackPath.ts
import * as THREE from 'three'

export const SILVERSTONE_WAYPOINTS: [number, number, number][] = [
  [0, 0, -4.5],    // Start/Finish straight
  [2.5, 0, -4.0],  // Copse approach
  [3.5, 0, -2.5],  // Copse
  [3.8, 0, -1.0],  // Maggotts
  [2.5, 0, 0.2],   // Becketts
  [1.5, 0, 1.5],   // Chapel
  [0.5, 0, 3.5],   // Hangar straight
  [-1.5, 0, 4.0],  // Stowe
  [-3.5, 0, 3.0],  // Vale
  [-4.5, 0, 1.0],  // Club
  [-4.0, 0, -1.5], // Abbey
  [-2.5, 0, -3.5], // Bridge
  [-1.0, 0, -4.5], // Priory
  [0, 0, -4.5],    // Close loop
]

export const SILVERSTONE_CURVE = new THREE.CatmullRomCurve3(
  SILVERSTONE_WAYPOINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  true,
)

export const TRACK_CENTER = new THREE.Vector3(0, 0, 0)

export const CORNER_POSITIONS: Record<string, THREE.Vector3> = {
  MB:    new THREE.Vector3(-1.2, 0, 0.8),
  Copse: new THREE.Vector3(2.1, 0, -1.4),
  Club:  new THREE.Vector3(-0.3, 0, 2.8),
  Stowe: new THREE.Vector3(-2.0, 0, 1.2),
}

export type CameraState = 'overview' | 'follow-driver' | 'corner-focus' | 'birds-eye' | 'split'
export type CameraTarget = { state: CameraState; corner?: string }
export type CameraFrame = { position: THREE.Vector3; lookAt: THREE.Vector3 }

function averagePositions(positions: THREE.Vector3[]): THREE.Vector3 {
  if (positions.length === 0) return TRACK_CENTER.clone()
  const sum = positions.reduce((acc, p) => acc.clone().add(p), new THREE.Vector3(0, 0, 0))
  return sum.divideScalar(positions.length)
}

export function getCameraPosition(
  target: CameraTarget,
  carPositions: Map<string, THREE.Vector3>,
  activeDriver: string
): CameraFrame {
  switch (target.state) {
    case 'follow-driver': {
      const pos = carPositions.get(activeDriver) ?? TRACK_CENTER
      return { position: pos.clone().add(new THREE.Vector3(0, 1.5, 2)), lookAt: pos.clone() }
    }
    case 'corner-focus': {
      const apex = CORNER_POSITIONS[target.corner ?? 'MB'] ?? TRACK_CENTER
      return { position: apex.clone().add(new THREE.Vector3(0, 2, 3)), lookAt: apex.clone() }
    }
    case 'birds-eye':
      return { position: new THREE.Vector3(0, 14, 0), lookAt: TRACK_CENTER.clone() }
    case 'split': {
      const mid = averagePositions([...carPositions.values()])
      return { position: mid.clone().add(new THREE.Vector3(0, 10, 4)), lookAt: mid.clone() }
    }
    default:
      return { position: new THREE.Vector3(0, 6, 8), lookAt: TRACK_CENTER.clone() }
  }
}
```

---

### Task 6: Write `lib/data.ts`

**Files:**
- `dashboard/lib/data.ts`

```typescript
// lib/data.ts
import predictionsRaw from '../public/data/predictions.json'
import shapRaw from '../public/data/shap_data.json'

export interface LapData {
  key: string
  year: number
  driver: string
  lap_number: number
  stint_id: number
  compound: string
  tyre_life: number
  lap_delta: number
  severity_true: number
  severity_pred: number
  severity_probs: [number, number, number, number]
  mode_true: string
  mode_pred: string
  mode_probs: { blistering: number; none: number; thermal: number; wear: number }
  track_progress: number
}

export interface SHAPEntry { [feature: string]: number }

export interface SHAPData {
  shap_values: { severity: Record<string, SHAPEntry>; mode: Record<string, SHAPEntry> }
  top_features: { severity: [string, number][]; mode: [string, number][] }
}

const predictions = predictionsRaw as { meta: unknown; laps: LapData[] }
const shapData = shapRaw as SHAPData

export function getDriversForYear(year: number): string[] {
  const drivers = new Set<string>()
  for (const lap of predictions.laps) {
    if (lap.year === year) drivers.add(lap.driver)
  }
  return Array.from(drivers).sort()
}

export function getLapRange(year: number, driver: string): [number, number] {
  const laps = predictions.laps.filter(l => l.year === year && l.driver === driver).map(l => l.lap_number)
  if (laps.length === 0) return [1, 1]
  return [Math.min(...laps), Math.max(...laps)]
}

export function getLap(year: number, driver: string, lapNumber: number): LapData | null {
  return predictions.laps.find(l => l.year === year && l.driver === driver && l.lap_number === lapNumber) ?? null
}

export function getSHAP(year: number, driver: string, lapNumber: number): SHAPEntry | null {
  const key = `${year}_${driver}_${lapNumber}`
  return shapData.shap_values.severity[key] ?? null
}

export function getStint(year: number, driver: string, stintId: number): LapData[] {
  return predictions.laps
    .filter(l => l.year === year && l.driver === driver && l.stint_id === stintId)
    .sort((a, b) => a.lap_number - b.lap_number)
}

export function getAllLapsForDriver(year: number, driver: string): LapData[] {
  return predictions.laps
    .filter(l => l.year === year && l.driver === driver)
    .sort((a, b) => a.lap_number - b.lap_number)
}
```

---

### Task 7: Write `lib/useReducedMotion.ts`

**Files:**
- `dashboard/lib/useReducedMotion.ts`

```typescript
// lib/useReducedMotion.ts
// Gate every animate() call with this hook to respect prefers-reduced-motion.
'use client'
import { useEffect, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}
```

Usage pattern in every component:
```typescript
const reducedMotion = useReducedMotion()
useEffect(() => {
  if (reducedMotion) return
  // animate(...)
}, [reducedMotion, currentLap])
```

---

### Task 8: Write `app/RaceContext.tsx`

**Files:**
- `dashboard/app/RaceContext.tsx`

```typescript
// app/RaceContext.tsx
'use client'
import * as THREE from 'three'
import { createContext, useContext, useState, useMemo, ReactNode } from 'react'

export interface RaceContextValue {
  currentLap: number
  currentYear: number
  currentDriver: string
  activePanelId: string | null
  topSHAPFeature: string | null
  trackStyle: 'A' | 'B' | 'C' | 'D'
  carPositions: Map<string, THREE.Vector3>
  setCurrentLap: (n: number) => void
  setCurrentYear: (y: number) => void
  setCurrentDriver: (d: string) => void
  setActivePanelId: (id: string | null) => void
  setTopSHAPFeature: (f: string | null) => void
  setTrackStyle: (s: 'A' | 'B' | 'C' | 'D') => void
  setCarPositions: (m: Map<string, THREE.Vector3>) => void
}

const RaceContext = createContext<RaceContextValue | null>(null)

export function RaceProvider({ children }: { children: ReactNode }) {
  const [currentLap, setCurrentLap] = useState(1)
  const [currentYear, setCurrentYear] = useState(2022)
  const [currentDriver, setCurrentDriver] = useState('NOR')
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [topSHAPFeature, setTopSHAPFeature] = useState<string | null>(null)
  const [trackStyle, setTrackStyle] = useState<'A' | 'B' | 'C' | 'D'>('A')
  const [carPositions, setCarPositions] = useState<Map<string, THREE.Vector3>>(new Map())

  const value = useMemo<RaceContextValue>(() => ({
    currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature, trackStyle, carPositions,
    setCurrentLap, setCurrentYear, setCurrentDriver, setActivePanelId, setTopSHAPFeature, setTrackStyle, setCarPositions,
  }), [currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature, trackStyle, carPositions])

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceContextValue {
  const ctx = useContext(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used inside <RaceProvider>')
  return ctx
}
```

---

## Part 4 — Components

---

### Task 9: Write `app/components/LapScrubber.tsx`

**Files:**
- `dashboard/app/components/LapScrubber.tsx`

```typescript
// app/components/LapScrubber.tsx
'use client'
import { useCallback, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getLapRange } from '../../lib/data'
import { useReducedMotion } from '../../lib/useReducedMotion'

export default function LapScrubber() {
  const { currentLap, currentYear, currentDriver, setCurrentLap } = useRaceContext()
  const [minLap, maxLap] = getLapRange(currentYear, currentDriver)
  const reducedMotion = useReducedMotion()

  // Keyboard navigation — NO animation (high-frequency, arrow keys)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrentLap(Math.min(currentLap + 1, maxLap))
      if (e.key === 'ArrowLeft')  setCurrentLap(Math.max(currentLap - 1, minLap))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentLap, minLap, maxLap, setCurrentLap])

  // Replay: single Anime.js v4 createTimeline, one .add() per lap at 800ms intervals
  const startReplay = useCallback(() => {
    if (reducedMotion) return
    // ✅ Anime.js v4: createTimeline (NOT anime.timeline())
    import('animejs').then(({ createTimeline }) => {
      const lapRef = { value: minLap }
      const lapRange = Array.from({ length: maxLap - minLap + 1 }, (_, i) => minLap + i)
      const tl = createTimeline({ defaults: { ease: 'outQuart', duration: 400 } })
      lapRange.forEach((lap, i) => { tl.add(lapRef, { value: lap }, i * 800) })
      tl.onUpdate = () => setCurrentLap(Math.round(lapRef.value))
    })
  }, [minLap, maxLap, setCurrentLap, reducedMotion])

  return (
    <div className="flex items-center gap-3 px-4 py-2" data-panel-id="scrubber">
      <span className="font-['Rajdhani'] text-sm text-[var(--text-muted)]">
        LAP {currentLap}/{maxLap}
      </span>
      <input
        type="range" min={minLap} max={maxLap} value={currentLap}
        onChange={e => setCurrentLap(Number(e.target.value))}
        aria-label={`Lap scrubber, lap ${currentLap} of ${maxLap}`}
        className="flex-1 cursor-pointer"
        style={{ accentColor: 'var(--mclaren)' }}
      />
      <button
        onClick={startReplay}
        aria-label="Replay race"
        className="px-3 py-1 bg-[var(--mclaren)] text-black font-['Rajdhani'] font-bold text-sm rounded hover:opacity-90 transition-opacity"
      >
        ▶ Replay
      </button>
    </div>
  )
}
```

---

### Task 10: Write `lib/useReplay.ts`

**Files:**
- `dashboard/lib/useReplay.ts`

```typescript
// lib/useReplay.ts
// Builds a single Anime.js v4 createTimeline once per [year, driver] combo.
// ✅ Anime.js v4: createTimeline — NOT anime.timeline()
'use client'
import { useRef, useEffect, useCallback } from 'react'
import { useReducedMotion } from './useReducedMotion'

export function useReplay(
  minLap: number,
  maxLap: number,
  onLapChange: (lap: number) => void
) {
  const reducedMotion = useReducedMotion()
  const tlRef = useRef<any>(null)
  const lapRef = useRef({ value: minLap })

  useEffect(() => {
    if (reducedMotion) return
    import('animejs').then(({ createTimeline }) => {
      const lapRange = Array.from({ length: maxLap - minLap + 1 }, (_, i) => minLap + i)
      const tl = createTimeline({ defaults: { ease: 'outQuart', duration: 400 }, autoplay: false })
      lapRange.forEach((lap, i) => { tl.add(lapRef.current, { value: lap }, i * 800) })
      tl.onUpdate = () => onLapChange(Math.round(lapRef.current.value))
      tlRef.current = tl
    })
    return () => { tlRef.current?.cancel() }
  }, [minLap, maxLap, reducedMotion, onLapChange])

  const play  = useCallback(() => tlRef.current?.play(), [])
  const pause = useCallback(() => tlRef.current?.pause(), [])
  const seek  = useCallback((lap: number) => tlRef.current?.seek((lap - minLap) * 800), [minLap])

  return { play, pause, seek }
}
```

---

### Task 11: Write `app/components/Header.tsx`

**Files:**
- `dashboard/app/components/Header.tsx`

```typescript
// app/components/Header.tsx
'use client'
import { useRef, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getDriversForYear } from '../../lib/data'
import { useReducedMotion } from '../../lib/useReducedMotion'

// ✅ Anime.js v4: animate + stagger + createTimeline

const LOGO_CHARS = 'LatentLap-AI'.split('')
const AVAILABLE_YEARS = [2021, 2022, 2023, 2024, 2025]
const TRACK_STYLES = ['A', 'B', 'C', 'D'] as const

export default function Header() {
  const { currentYear, currentDriver, trackStyle, setCurrentYear, setCurrentDriver, setActivePanelId, setTrackStyle } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const charRefs = useRef<(HTMLSpanElement | null)[]>([])

  // Logo char-by-char entrance on mount
  useEffect(() => {
    if (reducedMotion) return
    const els = charRefs.current.filter(Boolean) as HTMLSpanElement[]
    if (!els.length) return
    // ✅ Anime.js v4
    import('animejs').then(({ animate, stagger }) => {
      animate(els, { translateY: [20, 0], opacity: [0, 1], ease: 'outQuart', duration: 240, delay: stagger(30) })
    })
  }, [reducedMotion])

  const crossFadeThen = (fn: () => void) => {
    if (reducedMotion) { fn(); return }
    import('animejs').then(({ createTimeline }) => {
      const panels = Array.from(document.querySelectorAll('[data-panel-id]'))
      const tl = createTimeline({ defaults: { ease: 'inOutCubic', duration: 150 } })
      tl.add(panels, { opacity: [1, 0] }).add(panels, { opacity: [0, 1] })
      tl.onComplete = fn
    })
  }

  const drivers = getDriversForYear(currentYear)

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
      <div aria-label="LatentLap-AI" className="flex items-center gap-0.5">
        {LOGO_CHARS.map((char, i) => (
          <span key={i} ref={el => { charRefs.current[i] = el }}
            className="font-['Rajdhani'] font-bold text-xl text-[var(--mclaren)]" style={{ opacity: 0 }}>
            {char}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4">
        {/* Track style selector */}
        <div className="flex gap-1">
          {TRACK_STYLES.map(s => (
            <button key={s} onClick={() => setTrackStyle(s)} aria-pressed={trackStyle === s}
              className={`w-7 h-7 rounded text-xs font-['Rajdhani'] font-bold border transition-colors ${
                trackStyle === s ? 'bg-[var(--mclaren)] text-black border-[var(--mclaren)]'
                  : 'bg-transparent text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--mclaren)]'
              }`}>{s}</button>
          ))}
        </div>

        <select value={currentYear} onChange={e => crossFadeThen(() => setCurrentYear(Number(e.target.value)))}
          aria-label="Select year"
          className="bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 font-['DM_Sans'] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mclaren)]">
          {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={currentDriver} onChange={e => crossFadeThen(() => setCurrentDriver(e.target.value))}
          aria-label="Select driver"
          className="bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 font-['DM_Sans'] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mclaren)]">
          {drivers.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <button onClick={() => setActivePanelId(null)} aria-label="Reset camera to overview"
          className="px-2 py-1 border border-[var(--border)] text-[var(--text-muted)] text-xs font-['DM_Sans'] rounded hover:border-[var(--mclaren)] hover:text-[var(--mclaren)] transition-colors">
          Reset Camera
        </button>
      </div>
    </header>
  )
}
```

---

### Task 12: Write `app/components/TireHealth.tsx`

**Files:**
- `dashboard/app/components/TireHealth.tsx`

Key details:
- `utils.round(0)` from `animejs` rounds the animated float to an integer for the counter display
- Call `.pause()` on the previous animation instance before starting a new one (rapid scrubbing)
- Severity 3 border glow uses the CSS `@keyframes glow-pulse` defined in globals.css

```typescript
// app/components/TireHealth.tsx
'use client'
import { useRef, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getLap } from '../../lib/data'
import { getSeverityHex, getSeverityLabel } from '../../lib/severityColors'
import { useReducedMotion } from '../../lib/useReducedMotion'

// ✅ Anime.js v4: animate + utils.round(0) for integer counter

const MODE_KEYS = ['blistering', 'none', 'thermal', 'wear'] as const
const MODE_LABELS: Record<string, string> = { blistering: 'Blistering', none: 'No Failure', thermal: 'Thermal', wear: 'Wear' }

export default function TireHealth() {
  const { currentLap, currentYear, currentDriver, setActivePanelId } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const counterRef = useRef<{ value: number }>({ value: 0 })
  const displayRef = useRef<HTMLSpanElement>(null)
  const animRef = useRef<any>(null)
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({ blistering: null, none: null, thermal: null, wear: null })

  const lap = getLap(currentYear, currentDriver, currentLap)

  useEffect(() => {
    if (!lap || !displayRef.current) return
    if (reducedMotion) { displayRef.current.textContent = String(lap.severity_pred); return }

    // Interrupt previous counter, restart
    animRef.current?.pause()
    counterRef.current.value = Number(displayRef.current.textContent ?? 0)

    // ✅ Anime.js v4: utils.round(0) + ease: 'outExpo' (NOT easing: 'easeOutExpo')
    import('animejs').then(({ animate, utils }) => {
      animRef.current = animate(counterRef.current, {
        value: lap.severity_pred,
        modifier: utils.round(0),
        ease: 'outExpo',
        duration: 600,
        onUpdate: () => { if (displayRef.current) displayRef.current.textContent = String(counterRef.current.value) },
      })
    })

    // Animate mode bars
    if (lap.mode_probs) {
      const maxProb = Math.max(...Object.values(lap.mode_probs))
      MODE_KEYS.forEach(mode => {
        const bar = barRefs.current[mode]
        if (!bar) return
        const pct = maxProb > 0 ? (lap.mode_probs[mode] / maxProb) * 100 : 0
        import('animejs').then(({ animate }) => {
          animate(bar, { width: `${pct}%`, ease: 'inOutCubic', duration: 240 })
        })
      })
    }
  }, [currentLap, currentYear, currentDriver, lap, reducedMotion])

  if (!lap) return <div className="p-4 text-[var(--text-muted)]">No data for this lap.</div>

  const sevColor = getSeverityHex(lap.severity_pred)
  const isCritical = lap.severity_pred >= 3

  return (
    <section data-panel-id="tire-health" onFocus={() => setActivePanelId('tire-health')} tabIndex={0}
      aria-label="Tire health panel"
      className={`p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg ${
        isCritical ? 'animate-[glow-pulse_1.2s_ease_infinite]' : ''
      }`}>
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">Tire Severity</p>

      <div className="flex items-baseline gap-2 mb-2">
        <span ref={displayRef} className="font-['Rajdhani'] font-bold text-6xl leading-none"
          style={{ color: sevColor }} aria-live="polite" aria-label={`Severity ${lap.severity_pred}`}>
          {lap.severity_pred}
        </span>
        <span className="font-['Rajdhani'] text-2xl text-[var(--text-muted)]">/3</span>
      </div>

      <p className="font-['DM_Sans'] text-sm mb-3" style={{ color: sevColor }}>
        {getSeverityLabel(lap.severity_pred)}
        {isCritical && <span className="ml-2 text-xs text-[var(--text-muted)]">heuristic proxy — not a physical tire sensor</span>}
      </p>

      <img src="/media/mclaren_car_front.webp" alt="McLaren F1 car"
        className="w-full h-20 object-contain mb-3"
        style={{ filter: `hue-rotate(${lap.severity_pred * 30}deg)` }} />

      <div className="space-y-2">
        {MODE_KEYS.map(mode => (
          <div key={mode} className="space-y-0.5">
            <div className="flex justify-between text-xs font-['DM_Sans'] text-[var(--text-muted)]">
              <span>{MODE_LABELS[mode]}</span>
              <span className="font-['Fira_Code']">{(lap.mode_probs[mode] * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-[var(--surface-2)] rounded overflow-hidden">
              <div ref={el => { barRefs.current[mode] = el }}
                className="h-full bg-[var(--mclaren)] rounded" style={{ width: '0%' }}
                role="progressbar" aria-valuenow={Math.round(lap.mode_probs[mode] * 100)}
                aria-label={`${MODE_LABELS[mode]} probability`} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

---

### Task 13: Write `app/components/ShapPanel.tsx`

**Files:**
- `dashboard/app/components/ShapPanel.tsx`

```typescript
// app/components/ShapPanel.tsx
'use client'
import { useRef, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getSHAP } from '../../lib/data'
import { useReducedMotion } from '../../lib/useReducedMotion'

// ✅ Anime.js v4: animate + stagger — scaleX from 0→1 with stagger(40)

const FEATURE_LABELS: Record<string, string> = {
  MB_PeakLatG:    'Maggotts-Becketts Peak G',
  MB_TimeSec:     'Maggotts-Becketts Sector Time',
  Copse_PeakLatG: 'Copse Peak Lateral G',
  Copse_TimeSec:  'Copse Sector Time',
  Club_TimeSec:   'Club Sector Time',
  Stowe_PeakLatG: 'Stowe Peak Lateral G',
  TyreLife:       'Tyre Age (laps)',
  AirTemp:        'Air Temperature',
  TrackTemp:      'Track Temperature',
  AggressionZ:    'Driving Aggression Index',
}
const humanReadable = (f: string) => FEATURE_LABELS[f] ?? f.replace(/_/g, ' ')

export default function ShapPanel() {
  const { currentLap, currentYear, currentDriver, setActivePanelId, setTopSHAPFeature } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const barRefs = useRef<(HTMLDivElement | null)[]>([])

  const shapEntry = getSHAP(currentYear, currentDriver, currentLap)
  const top3 = shapEntry
    ? Object.entries(shapEntry).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)
    : []

  useEffect(() => { setTopSHAPFeature(top3[0]?.[0] ?? null) }, [top3, setTopSHAPFeature])

  const maxAbs = top3.length > 0 ? Math.max(...top3.map(([, v]) => Math.abs(v))) : 1

  // ✅ Anime.js v4: stagger entrance on lap change
  useEffect(() => {
    if (reducedMotion) return
    const els = barRefs.current.filter(Boolean) as HTMLDivElement[]
    if (!els.length) return
    import('animejs').then(({ animate, stagger }) => {
      animate(els, {
        scaleX: [0, 1],
        transformOrigin: ['left center', 'left center'],
        ease: 'outQuart',
        duration: 240,
        delay: stagger(40),
      })
    })
  }, [currentLap, currentYear, currentDriver, reducedMotion])

  return (
    <section data-panel-id="shap" onFocus={() => setActivePanelId('shap')} tabIndex={0}
      aria-label="SHAP feature explanation panel"
      className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
        Top Predictors — Lap {currentLap}
      </p>

      {top3.length === 0 ? (
        <p className="font-['DM_Sans'] text-sm text-[var(--text-muted)]">No SHAP data available.</p>
      ) : (
        <div className="space-y-3">
          {top3.map(([feature, value], i) => {
            const pct = (Math.abs(value) / maxAbs) * 100
            const barColor = value >= 0 ? 'var(--mclaren)' : '#2979FF'
            return (
              <div key={feature}>
                <div className="flex justify-between mb-0.5">
                  <span className="font-['Fira_Code'] text-xs text-[var(--text-primary)]">{humanReadable(feature)}</span>
                  <span className="font-['Rajdhani'] text-sm" style={{ color: barColor }}>
                    {value >= 0 ? '+' : ''}{value.toFixed(3)}
                  </span>
                </div>
                <div className="h-2 bg-[var(--surface-2)] rounded overflow-hidden">
                  <div ref={el => { barRefs.current[i] = el }}
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                    className="h-full rounded"
                    role="progressbar"
                    aria-valuenow={Math.round(Math.abs(value) * 1000) / 1000}
                    aria-label={`Feature: ${humanReadable(feature)}, contribution: ${value >= 0 ? '+' : ''}${value.toFixed(3)}`} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
```

---

### Task 14: Write `app/components/Timeline.tsx`

**Files:**
- `dashboard/app/components/Timeline.tsx`

```typescript
// app/components/Timeline.tsx
'use client'
import { useEffect } from 'react'
import {
  ComposedChart, Bar, Cell, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useRaceContext } from '../RaceContext'
import { getAllLapsForDriver } from '../../lib/data'
import { getSeverityHex } from '../../lib/severityColors'
import { useReducedMotion } from '../../lib/useReducedMotion'

// ✅ Anime.js v4: pit marker bounce only — Recharts handles bar animation natively

export default function Timeline() {
  const { currentLap, currentYear, currentDriver, setCurrentLap, setActivePanelId } = useRaceContext()
  const reducedMotion = useReducedMotion()

  const laps = getAllLapsForDriver(currentYear, currentDriver)
  const pitLaps = laps
    .filter((lap, i) => i > 0 && lap.stint_id !== laps[i - 1].stint_id)
    .map(l => l.lap_number)

  // Pit marker bounce after Recharts animation completes
  useEffect(() => {
    if (reducedMotion) return
    const timeout = setTimeout(() => {
      const markers = document.querySelectorAll('.pit-marker-icon')
      if (!markers.length) return
      // ✅ Anime.js v4: ease: 'outElastic(1, .6)' (NOT easing: 'easeOutElastic')
      import('animejs').then(({ animate }) => {
        animate(Array.from(markers), { translateY: [-12, 0], opacity: [0, 1], ease: 'outElastic(1, .6)', duration: 500 })
      })
    }, 900)
    return () => clearTimeout(timeout)
  }, [currentYear, currentDriver, reducedMotion])

  const chartData = laps.map(l => ({
    lap: l.lap_number,
    severity: l.severity_pred,
    lapDelta: l.lap_delta,
  }))

  return (
    <section data-panel-id="timeline" onFocus={() => setActivePanelId('timeline')} tabIndex={0}
      aria-label="Race timeline chart"
      className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
        Race Timeline — {currentDriver} {currentYear}
      </p>

      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} onClick={d => d?.activeLabel && setCurrentLap(Number(d.activeLabel))}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="lap" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Fira Code' }} />
          <YAxis yAxisId="sev" domain={[0, 3]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={20} />
          <YAxis yAxisId="delta" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={30} />
          <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontFamily: 'DM Sans' }} />

          <Bar yAxisId="sev" dataKey="severity"
            isAnimationActive={!reducedMotion} animationDuration={800} animationEasing="ease-out">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={getSeverityHex(entry.severity)}
                stroke={entry.lap === currentLap ? '#FFFFFF' : 'transparent'}
                strokeWidth={entry.lap === currentLap ? 2 : 0} />
            ))}
          </Bar>

          <Area yAxisId="delta" type="monotone" dataKey="lapDelta"
            stroke="var(--mclaren)" fill="var(--mclaren)" fillOpacity={0.15} strokeWidth={1.5}
            isAnimationActive={!reducedMotion} animationDuration={800} />

          {pitLaps.map(lap => (
            <ReferenceLine key={lap} yAxisId="sev" x={lap}
              stroke="var(--text-muted)" strokeDasharray="4 2"
              label={{ value: '⏹', position: 'top', fill: 'var(--mclaren)', fontSize: 10, className: 'pit-marker-icon' }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  )
}
```

---

### Task 15: Write `app/components/Comparison.tsx`

**Files:**
- `dashboard/app/components/Comparison.tsx`

```typescript
// app/components/Comparison.tsx
'use client'
import { useRef, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getAllLapsForDriver, getDriversForYear } from '../../lib/data'
import { useReducedMotion } from '../../lib/useReducedMotion'

// ✅ Anime.js v4: SVG strokeDashoffset draw-on, ease: 'outExpo', duration: 1200

export default function Comparison() {
  const { currentYear, currentDriver, setActivePanelId } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const norPathRef = useRef<SVGPathElement>(null)
  const otherPathRef = useRef<SVGPathElement>(null)

  const drivers = getDriversForYear(currentYear)
  const otherDriver = drivers.find(d => d !== currentDriver) ?? null

  const norLaps = getAllLapsForDriver(currentYear, currentDriver)
  const otherLaps = otherDriver ? getAllLapsForDriver(currentYear, otherDriver) : []

  const W = 800, H = 100, PAD = 10
  const maxLap = Math.max(norLaps.length, otherLaps.length)
  const toX = (i: number) => PAD + ((i / Math.max(maxLap - 1, 1)) * (W - PAD * 2))
  const toY = (sev: number) => H - PAD - ((sev / 3) * (H - PAD * 2))
  const toPath = (laps: typeof norLaps) =>
    laps.length === 0 ? '' : laps.map((l, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(l.severity_pred).toFixed(1)}`).join(' ')

  const norPathD = toPath(norLaps)
  const otherPathD = toPath(otherLaps)

  // SVG draw-on animation
  useEffect(() => {
    if (reducedMotion) return
    const paths = [norPathRef.current, otherPathRef.current].filter(Boolean) as SVGPathElement[]
    paths.forEach(path => {
      const length = path.getTotalLength()
      path.style.strokeDasharray = String(length)
      path.style.strokeDashoffset = String(length)
    })
    // ✅ Anime.js v4: ease: 'outExpo' (NOT easing: 'easeOutExpo')
    import('animejs').then(({ animate }) => {
      animate(paths, { strokeDashoffset: [null, 0], ease: 'outExpo', duration: 1200 })
    })
  }, [currentYear, currentDriver, otherDriver, reducedMotion])

  return (
    <section data-panel-id="comparison" onFocus={() => setActivePanelId('comparison')} tabIndex={0}
      aria-label="Stint comparison chart"
      className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
        Driver Comparison — {currentYear}
      </p>

      {!otherDriver && (
        <p className="font-['DM_Sans'] text-sm text-[var(--text-muted)]">
          Single driver — no comparison available for {currentYear}.
        </p>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label={`Severity comparison: ${currentDriver} vs ${otherDriver}`}>
        {/* Shaded divergence region */}
        {norLaps.map((nl, i) => {
          const ol = otherLaps[i]
          if (!ol || Math.abs(nl.severity_pred - ol.severity_pred) < 1) return null
          return <rect key={i} x={toX(i) - 2} y={PAD} width={4} height={H - PAD * 2} fill="#FF174420" />
        })}

        <path ref={norPathRef} d={norPathD} fill="none" stroke="var(--mclaren)" strokeWidth={2} />

        {otherDriver && (
          <path ref={otherPathRef} d={otherPathD} fill="none" stroke="#2979FF" strokeWidth={2} strokeDasharray="6 4" />
        )}

        <text x={PAD} y={H - 2} fill="var(--mclaren)" fontSize={9} fontFamily="Fira Code">{currentDriver}</text>
        {otherDriver && (
          <text x={PAD + 40} y={H - 2} fill="#2979FF" fontSize={9} fontFamily="Fira Code">{otherDriver} (dashed)</text>
        )}
      </svg>
    </section>
  )
}
```

---

### Task 16: Write `app/components/Track3D.tsx`

**Files:**
- `dashboard/app/components/Track3D.tsx`

**CRITICAL GOTCHAS:**
- `'use client'` directive MANDATORY — R3F does not work in RSC
- `OrbitControls` from `@react-three/drei` — NEVER from `three/examples/jsm/controls/OrbitControls`
- **DO NOT test with headless browser** — WebGL requires a GPU; headless Chromium will crash with `BindToCurrentSequence failed`. Test logic helpers in unit tests; visual QA in real Chrome only.

```typescript
// app/components/Track3D.tsx
'use client'
import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useRaceContext } from '../RaceContext'
import { getAllLapsForDriver, getDriversForYear, LapData } from '../../lib/data'
import { getSeverityHex } from '../../lib/severityColors'
import { SILVERSTONE_CURVE, CORNER_POSITIONS, TRACK_CENTER, getCameraPosition } from '../../lib/trackPath'

const TRACK_STYLES: Record<string, { color: string; emissive: string; emissiveIntensity: number }> = {
  A: { color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 0.8 },
  B: { color: '#FF8000', emissive: '#FF6000', emissiveIntensity: 0.6 },
  C: { color: '#00E5FF', emissive: '#00B8D9', emissiveIntensity: 0.5 },
  D: { color: '#FF1744', emissive: '#CC0033', emissiveIntensity: 0.5 },
}

const CORNER_LABELS: Record<string, string> = { MB: 'M-B', Copse: 'Copse', Club: 'Club', Stowe: 'Stowe' }

function Track({ style }: { style: string }) {
  const cfg = TRACK_STYLES[style] ?? TRACK_STYLES.A
  const tubeGeom = useMemo(() => new THREE.TubeGeometry(SILVERSTONE_CURVE, 200, 0.08, 8, true), [])
  return (
    <mesh geometry={tubeGeom}>
      <meshStandardMaterial color={cfg.color} emissive={cfg.emissive} emissiveIntensity={cfg.emissiveIntensity} />
    </mesh>
  )
}

function Car({ lapProgress, severityPred }: { lapProgress: number; severityPred: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const clampedProgress = Math.max(0, Math.min(lapProgress, 0.9999))
  const position = SILVERSTONE_CURVE.getPointAt(clampedProgress)
  const tangent = SILVERSTONE_CURVE.getTangentAt(clampedProgress)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    meshRef.current.position.copy(position)
    meshRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent)
  })

  const isCritical = severityPred >= 2
  const { clock } = useThree()
  const glowIntensity = severityPred >= 3
    ? Math.sin(clock.elapsedTime * 4) * 0.5 + 1.5
    : severityPred * 2

  return (
    <group>
      <mesh ref={meshRef}>
        <boxGeometry args={[0.2, 0.08, 0.35]} />
        <meshStandardMaterial
          color={getSeverityHex(severityPred)}
          emissive={isCritical ? '#FF1744' : '#000000'}
          emissiveIntensity={isCritical ? 0.5 : 0}
        />
      </mesh>
      {isCritical && (
        <pointLight position={[position.x, position.y + 0.2, position.z]}
          color="#FF1744" intensity={glowIntensity} distance={2} />
      )}
    </group>
  )
}

function CameraController({ activePanelId, topSHAPFeature, carPositions, activeDriver }: {
  activePanelId: string | null; topSHAPFeature: string | null;
  carPositions: Map<string, THREE.Vector3>; activeDriver: string
}) {
  const { camera } = useThree()
  const orbitRef = useRef<any>(null)
  const cornerPrefix = topSHAPFeature?.split('_')[0]

  const cameraTarget = useMemo(() => {
    if (activePanelId === 'tire-health') return { state: 'follow-driver' as const }
    if (activePanelId === 'shap' && cornerPrefix && ['MB', 'Copse', 'Club', 'Stowe'].includes(cornerPrefix))
      return { state: 'corner-focus' as const, corner: cornerPrefix }
    if (activePanelId === 'timeline' || activePanelId === 'comparison') return { state: 'birds-eye' as const }
    return { state: 'overview' as const }
  }, [activePanelId, cornerPrefix])

  useFrame(() => {
    const frame = getCameraPosition(cameraTarget, carPositions, activeDriver)
    camera.position.lerp(frame.position, 0.04)
    if (orbitRef.current) { orbitRef.current.target.lerp(frame.lookAt, 0.04); orbitRef.current.update() }
  })

  return <OrbitControls ref={orbitRef} minPolarAngle={0} maxPolarAngle={Math.PI / 2} enableDamping />
}

function Scene() {
  const { currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature, trackStyle, setCarPositions } = useRaceContext()
  const drivers = getDriversForYear(currentYear)
  const carPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map())

  const driverData = useMemo(() => {
    const result: Record<string, { progress: number; severity: number }> = {}
    for (const driver of drivers) {
      const laps = getAllLapsForDriver(currentYear, driver)
      const lap = laps.find((l: LapData) => l.lap_number === currentLap)
      if (lap) result[driver] = { progress: lap.track_progress, severity: lap.severity_pred }
    }
    return result
  }, [currentYear, currentDriver, currentLap, drivers])

  useFrame(() => {
    const updated = new Map<string, THREE.Vector3>()
    for (const [driver, data] of Object.entries(driverData)) {
      updated.set(driver, SILVERSTONE_CURVE.getPointAt(Math.max(0, Math.min(data.progress, 0.9999))))
    }
    setCarPositions(updated)
    carPositionsRef.current = updated
  })

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 5, 0]} intensity={0.8} color="#FFFFFF" />
      <Track style={trackStyle} />
      <Stars radius={80} depth={50} count={200} factor={4} fade />

      {Object.entries(driverData).map(([driver, data]) => (
        <Car key={driver} lapProgress={data.progress} severityPred={data.severity} />
      ))}

      {Object.entries(CORNER_POSITIONS).map(([name, pos]) => (
        <Html key={name} position={[pos.x, pos.y + 0.3, pos.z]} center>
          <span className="font-['Fira_Code'] text-[10px] text-[var(--text-muted)] pointer-events-none">
            {CORNER_LABELS[name] ?? name}
          </span>
        </Html>
      ))}

      <CameraController activePanelId={activePanelId} topSHAPFeature={topSHAPFeature}
        carPositions={carPositionsRef.current} activeDriver={currentDriver} />
    </>
  )
}

export default function Track3D() {
  return (
    <div className="relative w-full h-full">
      <video src="/media/silverstone_flyover.mp4" autoPlay loop muted playsInline preload="none"
        className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" aria-hidden="true" />
      <Canvas camera={{ position: [0, 6, 8], fov: 50 }} aria-label="Silverstone circuit 3D visualization" className="w-full h-full">
        <Scene />
      </Canvas>
    </div>
  )
}
```

---

## Part 5 — Final Layout Integration

---

### Task 17: Write `app/page.tsx`

**Files:**
- `dashboard/app/page.tsx`

```typescript
// app/page.tsx
'use client'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { RaceProvider } from './RaceContext'
import Header from './components/Header'
import LapScrubber from './components/LapScrubber'
import TireHealth from './components/TireHealth'
import ShapPanel from './components/ShapPanel'
import Timeline from './components/Timeline'
import Comparison from './components/Comparison'

// ssr: false required — WebGL + static export cannot SSR
const Track3D = dynamic(() => import('./components/Track3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--surface)]">
      <video src="/media/loading_loop.mp4" autoPlay loop muted playsInline
        className="w-48 h-48 object-cover opacity-60" aria-label="Loading animation" />
    </div>
  ),
})

export default function DashboardPage() {
  return (
    <RaceProvider>
      <div className="min-h-screen bg-[var(--bg)] flex flex-col">
        <Header />

        <div className="flex flex-1 flex-col md:flex-row gap-3 p-3">
          {/* LEFT: 3D Track + Scrubber */}
          <div className="flex flex-col gap-2 w-full md:w-[55%]">
            <div className="flex-1 min-h-[45vh] md:min-h-0 rounded-lg overflow-hidden border border-[var(--border)]">
              <Suspense><Track3D /></Suspense>
            </div>
            <LapScrubber />
          </div>

          {/* RIGHT: TireHealth + ShapPanel */}
          <div className="flex flex-col gap-3 w-full md:w-[45%]">
            <TireHealth />
            <ShapPanel />
          </div>
        </div>

        <div className="px-3 pb-3"><Timeline /></div>
        <div className="px-3 pb-6"><Comparison /></div>
      </div>
    </RaceProvider>
  )
}
```

---

### Task 18: Integration smoke test

- [ ] **Step 1: Dev server verification (real Chrome — NOT headless)**

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
npx next dev
```

Open `http://localhost:3000` in Chrome. Verify:
1. Logo chars animate in (Rajdhani, McLaren orange)
2. Year/driver dropdowns populate from JSON
3. Scrubber updates all panels in sync
4. Track style buttons A/B/C/D change 3D track color
5. Arrow keys advance/retreat lap
6. Timeline bar click updates currentLap
7. Comparison SVG paths draw on mount
8. TireHealth border pulses red on severity-3 laps
9. Panel focus shifts camera POV in Track3D
10. "Reset Camera" returns to overview

- [ ] **Step 2: Static build**

```bash
npx next build && ls out/
```

Expected: `out/index.html` exists, no SSR errors.

---

## Part 6 — Higgsfield Asset Generation

---

### Task 19: Generate Higgsfield media assets (run once before final build)

Use the `higgsfield-generate` skill for each generation step.

- [ ] **Step 1: Verify Higgsfield CLI auth**

```bash
higgsfield account status
```

- [ ] **Step 2: Silverstone flyover (8s, 16:9)**

```bash
higgsfield generate create seedance_2_0 \
  --prompt "Aerial drone flyover of Silverstone Formula 1 circuit, overcast British summer sky, camera slowly orbiting at 100m altitude, asphalt track with white line markings, dark moody atmosphere, cinematic 4K, seamlessly loopable" \
  --duration 8 --aspect_ratio 16:9 --wait
```
Save as `dashboard/public/media/silverstone_flyover.mp4`.

- [ ] **Step 3: Tire blister close-up (4s, 1:1)**

```bash
higgsfield generate create seedance_2_0 \
  --prompt "Extreme macro close-up of a Formula 1 tire showing blistering damage, rubber bubbling under heat, slow motion, dark studio background, dramatic side lighting, photorealistic" \
  --duration 4 --aspect_ratio 1:1 --wait
```
Save as `dashboard/public/media/tire_blister_closeup.mp4`.

- [ ] **Step 4: Loading loop (3s, 16:9)**

```bash
higgsfield generate create seedance_2_0 \
  --prompt "Abstract heat shimmer rising from dark asphalt race track surface, shallow depth of field, dark moody atmosphere, 3-second seamless loop, no cars or people" \
  --duration 3 --aspect_ratio 16:9 --wait
```
Save as `dashboard/public/media/loading_loop.mp4`.

- [ ] **Step 5: McLaren car image (2K, 1:1)**

```bash
higgsfield generate create gpt_image_2 \
  --prompt "McLaren F1 2022 car papaya orange livery, front 3/4 angle, studio black background, dramatic rim lighting, photorealistic, clean silhouette, no text or logos" \
  --aspect_ratio 1:1 --resolution 2k --wait
```
Save as `dashboard/public/media/mclaren_car_front.webp`.

---

## Part 7 — Code Review + Deploy

---

### Task 20: Pre-merge code review

- [ ] **Step 1: Commit all changes**

```bash
git add dashboard/
git commit -m "feat: Phase 6 — interactive tire degradation dashboard (Next.js 14, R3F, Anime.js v4)"
```

- [ ] **Step 2: Get divergence SHAs**

```bash
BASE_SHA=$(git merge-base main HEAD)
HEAD_SHA=$(git rev-parse HEAD)
echo "BASE: $BASE_SHA  HEAD: $HEAD_SHA"
```

- [ ] **Step 3: Dispatch `superpowers:code-reviewer` subagent**

Provide SHAs and context. Key checks the reviewer must verify:
- All R3F components have `'use client'`
- Anime.js v4 API throughout: `animate()`, `createTimeline()`, `stagger()`, `ease:` keys — NO `anime({targets})`, NO `easing:` keys
- `OrbitControls` from `@react-three/drei` only (not three/examples)
- `useReducedMotion` called in every component that runs animations
- No `getServerSideProps` or API routes (static export constraint)
- Typography: only Rajdhani/Fira Code/DM Sans (never Inter/Roboto)

- [ ] **Step 4: Fix all Critical/Important issues, re-review**

---

### Task 21: Deploy to Vercel

Use `deploy-to-vercel` skill.

```bash
cd /Users/hussianaltufayli/Downloads/LatentLap-AI-main/dashboard
vercel --prod
```

Post-deploy visual QA in real Chrome (MANDATORY — not headless):
1. 3D track renders, OrbitControls active (drag/scroll)
2. Anime.js v4 animations fire with no console errors
3. Severity-3 laps show red glow pulse on TireHealth
4. Comparison SVG paths draw on mount
5. Test `prefers-reduced-motion` via Chrome DevTools → Rendering → Emulate

---

### Task 22: Merge to main

```bash
git checkout main
git merge --no-ff phase-6-dashboard -m "merge: Phase 6 interactive dashboard"
git push origin main
git branch -d phase-6-dashboard
```

---

## Anime.js v4 Cheat Sheet

| Component | Animation | Correct v4 code |
|---|---|---|
| Header | Logo char entrance | `animate(charEls, { translateY: [20,0], opacity: [0,1], ease: 'outQuart', duration: 240, delay: stagger(30) })` |
| Header | Panel cross-fade | `createTimeline().add(panels, { opacity: [1,0] }).add(panels, { opacity: [0,1] })` |
| TireHealth | Severity counter | `animate(obj, { value: n, modifier: utils.round(0), ease: 'outExpo', duration: 600 })` |
| TireHealth | Mode bars | `animate(barEl, { width: '50%', ease: 'inOutCubic', duration: 240 })` |
| ShapPanel | Stagger bars | `animate(barEls, { scaleX: [0,1], transformOrigin: ['left center','left center'], ease: 'outQuart', duration: 240, delay: stagger(40) })` |
| Timeline | Pit marker bounce | `animate(markers, { translateY: [-12,0], opacity: [0,1], ease: 'outElastic(1, .6)', duration: 500 })` |
| Comparison | SVG draw-on | `animate(paths, { strokeDashoffset: [null, 0], ease: 'outExpo', duration: 1200 })` |
| LapScrubber | Replay timeline | `createTimeline({ defaults: { ease: 'outQuart', duration: 400 } })` |

**Easing strings (v4 exact — never use `easeXxx` prefix):**
- Panel enter: `'outQuart'`
- Morph/reposition: `'inOutCubic'`
- Hero/illustrative: `'outExpo'`
- Bounce delight: `'outElastic(1, .6)'`
