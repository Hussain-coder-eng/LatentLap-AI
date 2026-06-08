'use client'
import shapData from '../../public/data/shap_data.json'

const CORNERS = ['Copse', 'MB', 'Stowe', 'Club'] as const

function interpolateColor(v: number): string {
  const r = Math.round(13 + v * (255 - 13))
  const g = Math.round(17 + v * (24 - 17))
  const b = Math.round(23 + v * (1 - 23))
  return `rgb(${r},${g},${b})`
}

interface CornerHeatmapProps {
  year: number
  driver: string
}

export default function CornerHeatmap({ year, driver }: CornerHeatmapProps) {
  const severity = (shapData as { shap_values: { severity: Record<string, Record<string, number>> } }).shap_values.severity

  const prefix = `${year}_${driver}_`
  const lapEntries = Object.entries(severity)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, features]) => ({ lapNum: parseInt(key.slice(prefix.length), 10), features }))
    .sort((a, b) => a.lapNum - b.lapNum)

  if (lapEntries.length === 0) {
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#888', textAlign: 'center' }}>
        No data
      </div>
    )
  }

  // stress[cornerIndex][lapIndex]
  const stress: number[][] = CORNERS.map(corner =>
    lapEntries.map(({ features }) => {
      const cornerPrefix = corner + '_'
      return Object.entries(features)
        .filter(([feat]) => feat.startsWith(cornerPrefix))
        .reduce((sum, [, val]) => sum + Math.abs(val), 0)
    })
  )

  const globalMax = Math.max(...stress.flatMap(row => row))
  if (globalMax === 0) {
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#888', textAlign: 'center' }}>
        No data
      </div>
    )
  }

  const numLaps = lapEntries.length
  const cellW = Math.max(6, Math.min(10, 280 / numLaps))
  const cellH = 16

  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <div style={{ fontSize: 8, color: '#888', letterSpacing: 1, fontFamily: 'monospace', marginBottom: 4 }}>
        CORNER STRESS HEATMAP
      </div>

      {/* Grid rows */}
      {CORNERS.map((corner, ci) => (
        <div key={corner} style={{ display: 'flex', alignItems: 'center', marginBottom: 1 }}>
          <span style={{
            fontSize: 8, color: '#888', fontFamily: 'monospace',
            width: 36, textAlign: 'right', marginRight: 4, lineHeight: `${cellH}px`,
            flexShrink: 0,
          }}>
            {corner}
          </span>
          {stress[ci].map((s, li) => (
            <div
              key={lapEntries[li].lapNum}
              style={{
                width: cellW,
                height: cellH,
                background: interpolateColor(s / globalMax),
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      ))}

      {/* X-axis lap labels */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
        <div style={{ width: 40, flexShrink: 0 }} />
        <div style={{ position: 'relative', height: 10, flexGrow: 1 }}>
          {lapEntries
            .filter((_, i) => i === 0 || lapEntries[i].lapNum % 5 === 0)
            .map(({ lapNum }, _, arr) => {
              const idx = lapEntries.findIndex(e => e.lapNum === lapNum)
              return (
                <span
                  key={lapNum}
                  style={{
                    position: 'absolute',
                    left: idx * cellW,
                    fontSize: 7,
                    color: '#555',
                    fontFamily: 'monospace',
                    transform: 'translateX(-50%)',
                    userSelect: 'none' as const,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lapNum}
                </span>
              )
            })}
        </div>
      </div>
    </div>
  )
}
