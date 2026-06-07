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
const shapData = shapRaw as unknown as SHAPData

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

// ── Corner SHAP breakdown ────────────────────────────────────────────────────

export type DegType = 'blister' | 'thermal' | 'wear' | 'other'

const SUFFIX_TYPE: Record<string, DegType> = {
  PeakLatG: 'blister',
  AvgLatG:  'blister',
  TimeSec:  'thermal',
  BrakeFraction: 'wear',
  EntrySpeed:    'wear',
}
// AvgThrottle, MinSpeed, ExitThrottle, PreBrakeLatG/Speed/Time intentionally
// omitted — no clean mapping to a single deg type; their SHAP weight falls into 'other'.

export interface CornerBreakdown {
  total:    number
  blister:  number
  thermal:  number
  wear:     number
  other:    number
  dominant: DegType
}

const CORNER_NAMES = ['MB', 'Copse', 'Stowe', 'Club'] as const

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
    const dominant: DegType = total === 0
      ? 'other'
      : (Object.keys(scores) as DegType[]).reduce((a, b) => scores[a] >= scores[b] ? a : b)
    result[corner] = { total, blister, thermal, wear, other, dominant }
  }
  return result
}

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
  timeDeltaSec:         number
  actualPitLap:         number
  actualCompound:       string
  remainingLaps:        number
}

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

  const stint1Laps       = laps.filter(l => l.lap_number <= simPitLap)
  const stintOneSevAtPit = stint1Laps[stint1Laps.length - 1]?.severity_pred ?? 0

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
