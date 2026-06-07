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
