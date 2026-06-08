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

const SVG_W = 300
const SVG_H = 140
const PAD_L = 10
const PAD_R = 10
const PAD_T = 20
const PAD_B = 10

export default function CrossSeasonChart({ driver }: CrossSeasonChartProps) {
  const plotW = SVG_W - PAD_L - PAD_R
  const plotH = SVG_H - PAD_T - PAD_B

  const yearData = YEARS.map(year => {
    const laps = getAllLapsForDriver(year, driver)
    const maxLap = Math.max(...laps.map(l => l.lap_number), 1)
    return { year, laps, maxLap }
  }).filter(d => d.laps.length > 0)

  return (
    <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
      <text
        x={SVG_W / 2} y={12}
        textAnchor="middle"
        fontSize={8} fill="#888"
        fontFamily="monospace" letterSpacing={1}
      >
        {driver} DEGRADATION 2023–2025
      </text>

      {YEARS.map((year, i) => (
        <g key={year} transform={`translate(${SVG_W - PAD_R - (YEARS.length - i) * 42}, ${PAD_T - 6})`}>
          <circle cx={4} cy={0} r={4} fill={YEAR_COLORS[year]} />
          <text x={12} y={4} fontSize={7} fill="#888" fontFamily="monospace">{year}</text>
        </g>
      ))}

      {yearData.map(({ year, laps, maxLap }) => {
        const points = laps.map(l => {
          const x = PAD_L + ((l.lap_number - 1) / Math.max(maxLap - 1, 1)) * plotW
          const y = PAD_T + plotH - (Math.min(Math.max(l.severity_pred, 0), 3) / 3) * plotH
          return `${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')
        return (
          <polyline
            key={year}
            points={points}
            fill="none"
            stroke={YEAR_COLORS[year]}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )
      })}
    </svg>
  )
}
