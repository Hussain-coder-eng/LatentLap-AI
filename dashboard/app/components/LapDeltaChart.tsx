'use client'

interface LapPoint {
  lap_number: number
  lap_delta: number
  severity_pred: number
}

interface LapDeltaChartProps {
  laps: LapPoint[]
  currentLap: number
}

const SVG_W = 300
const SVG_H = 120
const PAD_L = 10
const PAD_R = 10
const PAD_T = 10
const PAD_B = 10
const PLOT_W = SVG_W - PAD_L - PAD_R
const PLOT_H = SVG_H - PAD_T - PAD_B

export default function LapDeltaChart({ laps, currentLap }: LapDeltaChartProps) {
  if (!laps.length) return null

  const maxLap = Math.max(...laps.map(l => l.lap_number))

  const lapX = (lapNum: number) => PAD_L + (lapNum / maxLap) * PLOT_W
  const deltaY = (d: number) => PAD_T + PLOT_H - (Math.min(Math.max(d, 0), 2) / 2) * PLOT_H
  const sevY   = (s: number) => PAD_T + PLOT_H - (Math.min(Math.max(s, 0), 3) / 3) * PLOT_H

  const deltaPoints = laps.map(l => `${lapX(l.lap_number).toFixed(1)},${deltaY(l.lap_delta).toFixed(1)}`).join(' ')
  const sevPoints   = laps.map(l => `${lapX(l.lap_number).toFixed(1)},${sevY(l.severity_pred).toFixed(1)}`).join(' ')

  const curX = lapX(currentLap)

  return (
    <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
      {/* Lap delta polyline */}
      <polyline points={deltaPoints} fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Severity polyline */}
      <polyline points={sevPoints} fill="none" stroke="#FF8000" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Current lap vertical line */}
      <line
        x1={curX} y1={PAD_T}
        x2={curX} y2={PAD_T + PLOT_H}
        stroke="#ffffff33"
        strokeWidth={1}
        strokeDasharray="2 2"
      />

      {/* Y axis labels */}
      <text x={PAD_L} y={PAD_T - 2} fontSize={7} fill="#60a5fa" fontFamily="monospace">Δ LAP (s)</text>
      <text x={SVG_W - PAD_R} y={PAD_T - 2} fontSize={7} fill="#FF8000" fontFamily="monospace" textAnchor="end">SEVERITY</text>
    </svg>
  )
}
