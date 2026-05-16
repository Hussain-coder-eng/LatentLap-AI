// app/components/Timeline.tsx
'use client'
import { useEffect, useState } from 'react'
import {
  ComposedChart, Bar, Cell, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useRaceContext } from '../RaceContext'
import { getAllLapsForDriver } from '../../lib/data'
import { getSeverityHex } from '../../lib/severityColors'
import { useReducedMotion } from '../../lib/useReducedMotion'

// Anime.js v4: pit marker bounce only — Recharts handles bar animation natively

export default function Timeline() {
  const { currentLap, currentYear, currentDriver, setCurrentLap, setActivePanelId } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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
      // Anime.js v4: ease: 'outElastic(1, .6)' (NOT easing: 'easeOutElastic')
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
      className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2">
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
        Race Timeline — {currentDriver} {currentYear}
      </p>

      {/* MOD 6: responsive height wrapper */}
      <div className="h-[100px] sm:h-[120px] md:h-[160px]">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
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
        )}
      </div>
    </section>
  )
}
