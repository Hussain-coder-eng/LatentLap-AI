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
