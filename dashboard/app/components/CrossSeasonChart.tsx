'use client'
import { getAllLapsForDriver } from '../../lib/data'

interface CrossSeasonChartProps {
  driver: string
}

const YEARS = [2023, 2024, 2025] as const
const YEAR_COLORS: Record<number, string> = {
  2023: '#a78bfa',
  2024: '#34d399',
  2025: '#fb923c',
}

const SVG_W = 420
const SVG_H = 220
const PAD_L = 42
const PAD_R = 16
const PAD_T = 32
const PAD_B = 42

const Y_TICKS = [0, 1, 2, 3]
const X_TICKS = [0, 0.25, 0.5, 0.75, 1]

export default function CrossSeasonChart({ driver }: CrossSeasonChartProps) {
  const plotW = SVG_W - PAD_L - PAD_R
  const plotH = SVG_H - PAD_T - PAD_B

  const yearData = YEARS.map(year => {
    const laps = getAllLapsForDriver(year, driver)
    const maxLap = Math.max(...laps.map(l => l.lap_number), 1)
    return { year, laps, maxLap }
  }).filter(d => d.laps.length > 0)

  const xPos = (progress: number) => PAD_L + progress * plotW
  const yPos = (sev: number) => PAD_T + plotH - (Math.min(Math.max(sev, 0), 3) / 3) * plotH

  return (
    <svg
      width="100%"
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Chart title */}
      <text
        x={PAD_L + plotW / 2} y={14}
        textAnchor="middle"
        fontSize={9} fill="#aaa"
        fontFamily="monospace" letterSpacing={1}
      >
        {driver} · SILVERSTONE DEGRADATION BY SEASON
      </text>

      {/* Legend */}
      {YEARS.map((year, i) => (
        <g key={year} transform={`translate(${PAD_L + (plotW / YEARS.length) * i + 6}, ${PAD_T - 10})`}>
          <line x1={0} y1={0} x2={16} y2={0} stroke={YEAR_COLORS[year]} strokeWidth={2} />
          <text x={20} y={4} fontSize={8} fill={YEAR_COLORS[year]} fontFamily="monospace">{year}</text>
        </g>
      ))}

      {/* Horizontal gridlines + Y-axis ticks */}
      {Y_TICKS.map(sev => {
        const y = yPos(sev)
        const label = ['Healthy', 'Mild', 'Moderate', 'Critical'][sev]
        return (
          <g key={sev}>
            <line
              x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y}
              stroke="rgba(255,255,255,0.08)" strokeWidth={1}
            />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={7} fill="#666" fontFamily="monospace">
              {label}
            </text>
          </g>
        )
      })}

      {/* X-axis ticks */}
      {X_TICKS.map(t => {
        const x = xPos(t)
        return (
          <g key={t}>
            <line
              x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1}
            />
            <text x={x} y={PAD_T + plotH + 12} textAnchor="middle" fontSize={7} fill="#555" fontFamily="monospace">
              {Math.round(t * 100)}%
            </text>
          </g>
        )
      })}

      {/* Axes */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />

      {/* X-axis label */}
      <text
        x={PAD_L + plotW / 2} y={SVG_H - 4}
        textAnchor="middle" fontSize={8} fill="#777" fontFamily="monospace" letterSpacing={0.5}
      >
        Race progress %
      </text>

      {/* Y-axis label (rotated) */}
      <text
        x={10} y={PAD_T + plotH / 2}
        textAnchor="middle" fontSize={8} fill="#777" fontFamily="monospace" letterSpacing={0.5}
        transform={`rotate(-90, 10, ${PAD_T + plotH / 2})`}
      >
        Degradation severity
      </text>

      {/* Data lines */}
      {yearData.map(({ year, laps, maxLap }) => {
        const points = laps.map(l => {
          const progress = (l.lap_number - 1) / Math.max(maxLap - 1, 1)
          const x = xPos(progress)
          const y = yPos(l.severity_pred)
          return `${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')
        return (
          <polyline
            key={year}
            points={points}
            fill="none"
            stroke={YEAR_COLORS[year]}
            strokeWidth={2}
            strokeLinejoin="round"
            opacity={0.9}
          />
        )
      })}
    </svg>
  )
}
