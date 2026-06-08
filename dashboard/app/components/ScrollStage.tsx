'use client'
import { useEffect, useRef, useState } from 'react'
import { useRaceContext } from '../RaceContext'
import { getLap, getSHAP, getAllLapsForDriver } from '../../lib/data'
import { getSeverityHex, getSeverityLabel } from '../../lib/severityColors'
import TireHero from './TireHero'
import { SilverstoneCircuit } from './SilverstoneCircuit'
import { CalloutLeft, type CalloutLeftContent } from './CalloutLeft'
import { CalloutRight, type CalloutRightContent, type ShapRow } from './CalloutRight'
import ChapterDots from './ChapterDots'
import LapDeltaChart from './LapDeltaChart'
import CrossSeasonChart from './CrossSeasonChart'
import CornerHeatmap from './CornerHeatmap'
import strategyRaw from '../../public/data/strategy_recommendations.json'

const CHAPTER_THRESHOLDS = [0, 0.17, 0.34, 0.51, 0.68, 0.85]
const RACE_ARC_TIMELINE_BOTTOM_PX = 64
const RACE_ARC_TIMELINE_HEIGHT_PX = 18
const RACE_ARC_TIMELINE_MIN_SEGMENT_PX = 2
const RACE_ARC_TIMELINE_SIDE_INSET = 'clamp(16px, 12vw, 180px)'

const SILVERSTONE_RACE_META: Record<number, { name: string; date: string }> = {
  2021: { name: '2021 British Grand Prix', date: 'July 18, 2021' },
  2022: { name: '2022 British Grand Prix', date: 'July 3, 2022' },
  2023: { name: '2023 British Grand Prix', date: 'July 9, 2023' },
  2024: { name: '2024 British Grand Prix', date: 'July 7, 2024' },
  2025: { name: '2025 British Grand Prix', date: 'July 6, 2025' },
}

function getSilverstoneRaceMeta(year: number): { name: string; date: string } {
  return SILVERSTONE_RACE_META[year] ?? {
    name: `${year} British Grand Prix`,
    date: 'unknown race date',
  }
}

function progressToChapter(progress: number): number {
  for (let i = CHAPTER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (progress >= CHAPTER_THRESHOLDS[i]) return i
  }
  return 0
}

const SHAP_LABELS: Record<string, string> = {
  CumLatEnergy: 'Lateral Load Energy', LapVariance: 'Lap Time Variance',
  SpeedFL: 'FL Corner Exit Speed', StintEnergyFraction: 'Stint Energy Fraction',
  FuelEstKg: 'Fuel Load (est.)', LapNumber: 'Lap Number',
  FreshTyre: 'Fresh Tyre Bonus', HighSpeedCornerSec: 'High-Speed Corner Time',
  SLEI: 'Lateral Energy Index', EffectivePushFactor: 'Push Factor',
  MB_TimeSec: 'Maggots-Becketts Time', MB_PeakLatG: 'M-B Peak Lateral G',
  Copse_EntrySpeed: 'Copse Entry Speed', Copse_TimeSec: 'Copse Corner Time',
  Club_TimeSec: 'Club Corner Time', Club_EntrySpeed: 'Club Entry Speed',
  Stowe_AvgLatG: 'Stowe Lateral G', AvgYawRate: 'Avg Yaw Rate',
  BrakeDecel: 'Brake Deceleration', MaxLatG: 'Peak Lateral G',
  DirtyAirRatio: 'Dirty Air Exposure', MeanGapAhead: 'Gap to Car Ahead',
}

const FEATURE_LABELS: Record<string, string> = {
  MB_PeakLatG: 'Maggotts-Becketts G-Force', MB_TimeSec: 'Maggotts-Becketts Sector Time',
  Copse_PeakLatG: 'Copse Peak G-Force', Copse_TimeSec: 'Copse Sector Time',
  Club_TimeSec: 'Club Sector Time', Stowe_PeakLatG: 'Stowe Peak G-Force',
  TyreLife: 'Tyre Age (laps)', AirTemp: 'Air Temperature',
  TrackTemp: 'Track Temperature', AggressionZ: 'Driving Aggression Index',
}

const FEATURE_PLAIN: Record<string, (val: number) => string> = {
  MB_PeakLatG: v => `High lateral G through Maggotts-Becketts is ${v > 0 ? 'pushing' : 'reducing'} tire stress.`,
  MB_TimeSec:  v => `Sector time through the chicane complex is ${v > 0 ? 'slower than average, building heat' : 'fast, limiting heat buildup'}.`,
  Copse_PeakLatG: v => `Copse corner G-force is ${v > 0 ? 'amplifying' : 'reducing'} lateral stress on the front-left.`,
  Copse_TimeSec: v => `The Copse sector time is ${v > 0 ? 'contributing to' : 'reducing'} overall tire load.`,
  Club_TimeSec: v => `Club corner exit time is ${v > 0 ? 'adding' : 'reducing'} longitudinal wear.`,
  Stowe_PeakLatG: v => `Stowe peak G is ${v > 0 ? 'stressing' : 'easing'} the outer tire edge.`,
  TyreLife: v => `The tire is ${v > 0 ? 'aging — older compounds degrade faster under equal load' : 'relatively fresh, limiting degradation'}.`,
  AirTemp: v => `Ambient temperature is ${v > 0 ? 'warmer than baseline, softening the compound' : 'cooler, slowing thermal degradation'}.`,
  TrackTemp: v => `Track surface temperature is ${v > 0 ? 'hotter than average, increasing compound wear' : 'cooler, slightly reducing stress'}.`,
  AggressionZ: v => `Driving aggression index is ${v > 0 ? 'elevated — more aggressive inputs accelerate wear' : 'conservative, preserving compound life'}.`,
}

const REC_COLORS: Record<string, string> = {
  optimal: '#00E676', acceptable: '#FFD600', late: '#FF6D00', critical: '#FF1744',
}

function StrategyBars({ currentYear, currentDriver, currentLap }: {
  currentYear: number; currentDriver: string; currentLap: number
}) {
  const strategy = (strategyRaw as Record<string, Record<string, {
    pit_strategies: Array<{ pit_lap: number; finish_severity: number; recommendation: string }>;
    primary_pit_window: { start: number; end: number };
  }>>)[String(currentYear)]?.[currentDriver]
  if (!strategy) return null
  const { pit_strategies, primary_pit_window } = strategy
  const maxSev = Math.max(...pit_strategies.map(s => s.finish_severity))
  const fallback = maxSev === 0

  const windowLabel = currentLap >= primary_pit_window.end
    ? { text: 'OVERCUT WINDOW OPEN', color: '#FF1801' }
    : currentLap < primary_pit_window.start - 3
      ? { text: 'UNDERCUT OPPORTUNITY', color: '#22c55e' }
      : { text: 'IN PIT WINDOW', color: '#FF8000' }

  return (
    <div style={{
      position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: '60%', pointerEvents: 'none', zIndex: 10,
    }}>
      <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, textAlign: 'center', color: windowLabel.color, marginBottom: 2 }}>
        {windowLabel.text}
      </div>
      <div style={{ fontSize: 7, color: '#888', textAlign: 'center', fontFamily: 'monospace', marginBottom: 4 }}>
        Window: L{primary_pit_window.start}–L{primary_pit_window.end}
      </div>
      {fallback && (
        <div style={{ textAlign: 'center', color: '#FF8000', fontSize: 8, fontFamily: 'monospace', marginBottom: 4 }}>
          OPTIMAL WINDOW
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
        {pit_strategies.map(s => {
          const inWindow = s.pit_lap >= primary_pit_window.start && s.pit_lap <= primary_pit_window.end
          const barH = fallback ? 40 : (s.finish_severity / maxSev) * 70
          return (
            <div key={s.pit_lap} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '100%', height: barH,
                background: REC_COLORS[s.recommendation] ?? '#666',
                borderRadius: '2px 2px 0 0',
                opacity: inWindow ? 1 : 0.5,
                outline: s.pit_lap === currentLap ? '1px solid white' : undefined,
              }} />
              <span style={{ fontSize: 7, color: '#555', fontFamily: 'monospace', marginTop: 2 }}>
                L{s.pit_lap}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ScrollStage() {
  const { currentLap, currentYear, currentDriver } = useRaceContext()
  const stageRef = useRef<HTMLDivElement>(null)
  const pinRef   = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [activeChapter, setActiveChapter]   = useState(0)

  const lap      = getLap(currentYear, currentDriver, currentLap)
  const shapData = getSHAP(currentYear, currentDriver, currentLap)
  const laps     = getAllLapsForDriver(currentYear, currentDriver)
  const totalLaps = laps.length || 52
  const tickLaps: number[] = (() => {
    const ticks = [1]
    for (let l = 5; l < totalLaps; l += 5) ticks.push(l)
    if (ticks[ticks.length - 1] !== totalLaps) ticks.push(totalLaps)
    return ticks
  })()
  const raceMeta = getSilverstoneRaceMeta(currentYear)

  const severity  = lap?.severity_pred ?? 0
  const sevColor  = getSeverityHex(severity)
  const sevLabel  = getSeverityLabel(severity)

  // GSAP ScrollTrigger pin
  useEffect(() => {
    let st: { kill: () => void } | undefined
    import('gsap').then(({ default: gsap }) => {
      import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
        gsap.registerPlugin(ScrollTrigger)
        st = ScrollTrigger.create({
          trigger: stageRef.current,
          pin: pinRef.current,
          start: 'top top',
          end: '+=400%',
          scrub: true,
          onUpdate: (self: { progress: number }) => {
            const p = self.progress
            setScrollProgress(p)
            setActiveChapter(progressToChapter(p))
          },
        })
      })
    })
    return () => st?.kill()
  }, [])

  // Keyboard chapter navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown') scrollToChapter(Math.min(4, activeChapter + 1))
      if (e.key === 'PageUp')   scrollToChapter(Math.max(0, activeChapter - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeChapter])

  const scrollToChapter = (ch: number) => {
    setActiveChapter(ch)
    const el = stageRef.current
    if (!el) return
    const stageTop = el.getBoundingClientRect().top + window.scrollY
    const stageH   = el.scrollHeight - window.innerHeight
    window.scrollTo({ top: stageTop + CHAPTER_THRESHOLDS[ch] * stageH, behavior: 'smooth' })
  }

  // Build SHAP rows for chapter 2
  const top3Shap: ShapRow[] = shapData
    ? Object.entries(shapData)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 3)
        .map(([feat, val]) => {
          const maxAbs = Math.max(...Object.values(shapData).map(Math.abs))
          return {
            label: SHAP_LABELS[feat] ?? FEATURE_LABELS[feat] ?? feat,
            value: val,
            barPct: maxAbs > 0 ? (Math.abs(val) / maxAbs) * 100 : 0,
          }
        })
    : []

  const topFeatureKey = shapData
    ? Object.entries(shapData).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] ?? null
    : null

  const chapterContent: Array<{ left: CalloutLeftContent; right: CalloutRightContent }> = [
    // Chapter 0 — Hero
    {
      left: {
        label: 'LatentLap-AI',
        value: `McLaren · Silverstone · ${currentYear}`,
        valueColor: '#FF8000',
        explanation: `Following ${currentDriver} in the ${raceMeta.name}. Race date: ${raceMeta.date}. This dashboard reconstructs what happened inside McLaren's tires during a race — lap by lap — using AI trained on public F1 telemetry. Scroll to explore.`,
      },
      right: {
        heading: 'What is this?',
        customLines: ['XGBoost model trained on FastF1 telemetry.', 'Silverstone 2021–2025.', 'Outputs tire degradation severity 0–3 per lap.'],
        technicalDetail: 'Model: XGBoost classifier. Labels: weak supervision heuristics (not physical sensors). Features: sector times, lateral G, tyre age, air/track temp, aggression index.',
      },
    },
    // Chapter 1 — Severity
    {
      left: {
        label: 'Tire Severity',
        value: sevLabel,
        valueColor: sevColor,
        explanation: `Our model rates this lap at ${severity}/3 using probabilistic telemetry proxies. Scale: 0 = healthy, 1 = mild degradation, 2 = moderate degradation, 3 = critical degradation.`,
      },
      right: {
        heading: 'Failure Mode',
        customLines: lap?.mode_probs
          ? Object.entries(lap.mode_probs)
              .sort((a, b) => b[1] - a[1])
              .map(([mode, prob]) => `${mode.charAt(0).toUpperCase() + mode.slice(1)}: ${(prob * 100).toFixed(1)}%`)
          : ['No mode data'],
        technicalDetail: `DegSeverity: ${severity} (heuristic proxy — not a physical sensor)\nmode_probs: ${JSON.stringify(lap?.mode_probs ?? {}, null, 0)}`,
      },
    },
    // Chapter 2 — Predictors
    {
      left: {
        label: 'Top Predictors',
        value: `Lap ${currentLap}`,
        valueColor: '#FF8000',
        explanation: top3Shap[0]
          ? `${SHAP_LABELS[topFeatureKey ?? ''] ?? FEATURE_LABELS[topFeatureKey ?? ''] ?? topFeatureKey} is the primary driver of this lap's prediction. Positive values push severity up; negative pull it down.`
          : 'No SHAP data for this lap.',
      },
      right: {
        heading: 'Why this lap?',
        rows: top3Shap,
        customLines: top3Shap[0]
          ? [FEATURE_PLAIN[topFeatureKey ?? '']?.(top3Shap[0].value) ?? '']
          : [],
        technicalDetail: `SHAP (TreeExplainer): ${top3Shap.map(r => `${r.label}: ${r.value > 0 ? '+' : ''}${r.value.toFixed(3)}`).join(' | ')}\nBaseline expected value: ~1.12`,
      },
    },
    // Chapter 3 — Race Arc
    {
      left: {
        label: 'Race Arc',
        value: `${totalLaps} Predicted Laps`,
        valueColor: '#4a7a4a',
        subAnnotation: '(of 52 race laps)',
        explanation: 'This is the full tire story across the race. Scroll down to drive through each lap. Green = fresh, red = critical. The pit stop divides the two stints.',
      },
      right: {
        heading: 'Reading the arc',
        customLines: [
          `Current: Lap ${currentLap} · Severity ${severity}`,
          `Dominant mode: ${(() => {
            if (!lap?.mode_probs) return '—'
            const top = Object.entries(lap.mode_probs).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1])[0]
            if (!top) return 'NOMINAL'
            return top[0].toUpperCase() + (top[1] < 0.1 ? ' (trace)' : '')
          })()}`,
          'Drag the scrubber below to move through the race.',
        ],
        technicalDetail: `lapDelta and severity per lap from features_${currentYear}_${currentDriver}.json. Stint boundaries inferred from stint_id column.`,
      },
    },
    // Chapter 4 — Strategy
    {
      left: {
        label: 'Pit Strategy',
        value: 'When to pit?',
        valueColor: '#00E676',
        explanation: 'Each scenario shows the projected tire severity at race end depending on when McLaren pits. Green = optimal timing. The sweet spot minimises finish severity.',
      },
      right: {
        heading: 'Model recommendation',
        customLines: [
          'Green bars = optimal pit window.',
          'Yellow = acceptable but not ideal.',
          'Red = too late — high finish severity.',
        ],
        technicalDetail: 'strategy.py projects DegSeverity forward from each pit lap using stint-2 degradation rates. Heuristic — not derived from tire physics simulation.',
      },
    },
    // Chapter 5 — Season Comparison
    {
      left: {
        label: 'Season Comparison',
        value: '2023 · 2024 · 2025',
        valueColor: '#a78bfa',
        explanation: `How has ${currentDriver}'s tire degradation at Silverstone evolved across seasons? Purple = 2023, green = 2024, orange = 2025. X axis is normalized race progress.`,
      },
      right: {
        heading: 'Reading the chart',
        customLines: [
          'Higher line = more degradation.',
          '2025 line ends early (fewer predicted laps).',
          'Compare slope to see wear rate changes.',
        ],
        technicalDetail: 'Each season normalized to 0–1 lap progress. severity_pred from XGBoost model per lap.',
      },
    },
  ]

  const ch = chapterContent[activeChapter] ?? chapterContent[0]

  return (
    <>
      <ChapterDots activeChapter={activeChapter} onSelect={scrollToChapter} />

      <div ref={stageRef} style={{ height: '500vh' }}>
        <div
          ref={pinRef}
          className="scroll-stage-pin"
          style={{
            position: 'relative',
            width: '100%',
            height: '100vh',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(150px, 32vmin) minmax(0, 1fr)',
            columnGap: 'clamp(10px, 2.5vw, 40px)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(72px, 10vh, 96px) clamp(18px, 5vw, 72px) 72px',
            boxSizing: 'border-box',
            overflow: 'hidden',
            background: 'var(--bg)',
          }}
        >
          {/* Background circuit */}
          <SilverstoneCircuit activeChapter={activeChapter} />

          {/* Chapter 3 (Race Arc): compact lap severity timeline */}
          {activeChapter === 3 && (
            <div
              data-testid="race-arc-timeline"
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: RACE_ARC_TIMELINE_SIDE_INSET,
                right: RACE_ARC_TIMELINE_SIDE_INSET,
                bottom: RACE_ARC_TIMELINE_BOTTOM_PX,
                height: RACE_ARC_TIMELINE_HEIGHT_PX,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'stretch',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 4,
                overflow: 'hidden',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.28)',
                zIndex: 2,
              }}
            >
              {laps.map((l, i) => (
                <div key={l.lap_number} style={{
                  flex: 1,
                  minWidth: RACE_ARC_TIMELINE_MIN_SEGMENT_PX,
                  background: getSeverityHex(l.severity_pred),
                  borderRight: l.stint_id !== laps[i + 1]?.stint_id
                    ? '2px solid #FF8000' : undefined,
                  outline: l.lap_number === currentLap ? '1px solid rgba(255,255,255,0.75)' : undefined,
                  outlineOffset: -1,
                }} />
              ))}
            </div>
          )}

          {/* Chapter 3 (Race Arc): lap number tick labels below timeline */}
          {activeChapter === 3 && (
            <div
              style={{
                position: 'absolute',
                left: RACE_ARC_TIMELINE_SIDE_INSET,
                right: RACE_ARC_TIMELINE_SIDE_INSET,
                bottom: RACE_ARC_TIMELINE_BOTTOM_PX - 14,
                height: 12,
                pointerEvents: 'none',
              }}
            >
              {tickLaps.map(lapNum => (
                <span
                  key={lapNum}
                  style={{
                    position: 'absolute',
                    left: `${((lapNum - 1) / Math.max(totalLaps - 1, 1)) * 100}%`,
                    fontSize: 7,
                    color: '#555',
                    fontFamily: 'monospace',
                    transform: 'translateX(-50%)',
                    userSelect: 'none',
                  }}
                >
                  {lapNum}
                </span>
              ))}
            </div>
          )}

          {/* Chapter 2 (Predictors): corner stress heatmap — fixed lower panel above scrubber */}
          {activeChapter === 2 && (
            <div style={{
              position: 'fixed',
              bottom: 48,
              left: 0,
              right: 0,
              height: 120,
              background: 'rgba(8,8,8,0.92)',
              borderTop: '1px solid rgba(255,128,0,0.15)',
              zIndex: 40,
              overflow: 'hidden',
            }}>
              <CornerHeatmap year={currentYear} driver={currentDriver} />
            </div>
          )}

          {/* Chapter 4 (Strategy): pit lane bars + lap delta chart */}
          {activeChapter === 4 && (
            <>
              <StrategyBars currentYear={currentYear} currentDriver={currentDriver} currentLap={currentLap} />
              <div style={{
                position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)',
                width: '60%', pointerEvents: 'none',
              }}>
                <LapDeltaChart laps={laps} currentLap={currentLap} />
              </div>
            </>
          )}

          {/* Chapter 5 (Season Comparison): cross-season severity overlay */}
          {activeChapter === 5 && (
            <div style={{
              position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)',
              width: '60%', pointerEvents: 'none',
            }}>
              <CrossSeasonChart driver={currentDriver} />
            </div>
          )}

          {/* Left callout */}
          <CalloutLeft content={ch.left} visible={true} />

          {/* Center tire */}
          <TireHero scrollProgress={scrollProgress} />

          {/* Right callout */}
          <CalloutRight content={ch.right} visible={true} />
        </div>
      </div>
    </>
  )
}
