// app/components/StrategyAdvisor.tsx
'use client'
import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer
} from 'recharts'
import { useRaceContext } from '../RaceContext'
import strategyRaw from '../../public/data/strategy_recommendations.json'

interface PitStrategy {
  pit_lap: number
  finish_severity: number
  recommendation: string
  pit_window_start: number
  pit_window_end: number
}

interface StrategyData {
  current_lap: number
  current_severity: number | null
  pit_strategies: PitStrategy[]
  primary_pit_window: { start: number; end: number }
  confidence: string
}

const REC_COLORS: Record<string, string> = {
  optimal:    '#00E676',
  acceptable: '#FFD600',
  late:       '#FF6D00',
  critical:   '#FF1744',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   '#00E676',
  medium: '#FFD600',
  low:    '#FF6D00',
}

const strategy = strategyRaw as unknown as Record<string, Record<string, StrategyData>>

export default function StrategyAdvisor() {
  const { currentYear, currentDriver, currentLap, setActivePanelId } = useRaceContext()
  // Hydration-safe: initialise with default, then sync from localStorage in effect
  const [severityThreshold, setSeverityThreshold] = useState<number>(2.0)

  useEffect(() => {
    const stored = localStorage.getItem('strategy_severity_threshold')
    if (stored !== null) setSeverityThreshold(Number(stored))
  }, [])

  const data = useMemo((): StrategyData | null => {
    return strategy[String(currentYear)]?.[currentDriver] ?? null
  }, [currentYear, currentDriver])

  const handleThresholdChange = (value: number) => {
    setSeverityThreshold(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem('strategy_severity_threshold', String(value))
    }
  }

  if (!data) {
    return (
      <section data-panel-id="strategy" className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
        <p className="font-['DM_Sans'] text-sm text-[var(--text-muted)]">
          No strategy data for {currentDriver} {currentYear}.
        </p>
      </section>
    )
  }

  const { pit_strategies, primary_pit_window, confidence } = data
  const inPitWindow = currentLap >= primary_pit_window.start && currentLap <= primary_pit_window.end
  const chartData = pit_strategies.map(s => ({
    pitLap: s.pit_lap,
    finishSeverity: Number(s.finish_severity.toFixed(3)),
    recommendation: s.recommendation,
  }))

  return (
    <section
      data-panel-id="strategy"
      onFocus={() => setActivePanelId('strategy')}
      tabIndex={0}
      aria-label="Strategy advisor panel"
      className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2"
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest">
          Strategy Advisor — {currentDriver} {currentYear}
        </p>
        <div className="flex items-center gap-2">
          <span className="font-['Fira_Code'] text-xs" style={{ color: CONFIDENCE_COLORS[confidence] }}>
            {confidence} confidence
          </span>
          {inPitWindow && (
            <span className="px-2 py-0.5 bg-[var(--mclaren)] text-black text-xs font-['Rajdhani'] font-bold rounded animate-pulse">
              PIT WINDOW OPEN
            </span>
          )}
        </div>
      </div>

      {/* Pit window summary */}
      <div className="mb-3 p-2 bg-[var(--surface-2)] rounded border border-[var(--border)]">
        <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] mb-1">Primary Pit Window</p>
        <p className="font-['Rajdhani'] font-bold text-lg text-[var(--text-primary)]">
          Lap {primary_pit_window.start} – {primary_pit_window.end}
          <span className="ml-2 font-['DM_Sans'] text-sm font-normal text-[var(--text-muted)]">
            (Current: Lap {currentLap})
          </span>
        </p>
      </div>

      {/* Strategy table */}
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-xs font-['DM_Sans']" aria-label="Pit strategy comparison">
          <thead>
            <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="text-left py-1.5 pr-3">Pit Lap</th>
              <th className="text-left py-1.5 pr-3">Finish Sev.</th>
              <th className="text-left py-1.5 pr-3">Window</th>
              <th className="text-left py-1.5">Rating</th>
            </tr>
          </thead>
          <tbody>
            {pit_strategies.map(s => (
              <tr
                key={s.pit_lap}
                className={`border-b border-[var(--border)] ${
                  s.pit_lap >= primary_pit_window.start && s.pit_lap <= primary_pit_window.end
                    ? 'bg-[var(--surface-2)]' : ''
                }`}
              >
                <td className="py-1.5 pr-3 font-['Rajdhani'] font-bold text-sm text-[var(--text-primary)]">
                  L{s.pit_lap}
                </td>
                <td
                  className="py-1.5 pr-3 font-['Fira_Code']"
                  style={{ color: s.finish_severity >= severityThreshold ? '#FF1744' : '#00E676' }}
                >
                  {s.finish_severity.toFixed(3)}
                </td>
                <td className="py-1.5 pr-3 text-[var(--text-muted)]">
                  L{s.pit_window_start}–{s.pit_window_end}
                </td>
                <td className="py-1.5">
                  <span
                    className="px-1.5 py-0.5 rounded text-black text-xs font-['Rajdhani'] font-bold"
                    style={{ backgroundColor: REC_COLORS[s.recommendation] ?? '#666' }}
                  >
                    {s.recommendation}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recharts bar chart */}
      <div className="h-[100px] sm:h-[120px] md:h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="pitLap"
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Fira Code' }}
              tickFormatter={v => `L${v}`}
            />
            <YAxis domain={[0, 3]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={20} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 11 }}
              formatter={(value) => [Number(value).toFixed(3), 'Finish Severity']}
            />
            <ReferenceLine
              y={severityThreshold}
              stroke="var(--mclaren)"
              strokeDasharray="4 2"
              label={{ value: `Threshold ${severityThreshold.toFixed(1)}`, fill: 'var(--mclaren)', fontSize: 9, position: 'insideTopRight' }}
            />
            <Bar dataKey="finishSeverity" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={REC_COLORS[entry.recommendation] ?? 'var(--text-muted)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Threshold slider */}
      <div className="mt-3 pt-3 border-t border-[var(--border)]">
        <label className="flex items-center justify-between font-['DM_Sans'] text-xs text-[var(--text-muted)] mb-1">
          <span>Severity Threshold (flags finish severity ≥ value)</span>
          <span className="font-['Fira_Code'] text-[var(--text-primary)]">{severityThreshold.toFixed(1)}</span>
        </label>
        <input
          type="range" min={0} max={3} step={0.1}
          value={severityThreshold}
          onChange={e => handleThresholdChange(Number(e.target.value))}
          aria-label={`Severity threshold: ${severityThreshold}`}
          className="w-full cursor-pointer touch-manipulation active:scale-[0.97] transition-transform"
          style={{ accentColor: 'var(--mclaren)' }}
        />
        <p className="text-[var(--text-muted)] text-[10px] font-['DM_Sans'] mt-1">
          Threshold saved to localStorage. Heuristic — not a physical sensor.
        </p>
      </div>
    </section>
  )
}
