// app/components/SeverityBadgeCard.tsx
'use client'
import { useRaceContext } from '../RaceContext'
import { getLap } from '../../lib/data'
import { getSeverityHex, getSeverityLabel } from '../../lib/severityColors'

export default function SeverityBadgeCard() {
  const { currentLap, currentYear, currentDriver } = useRaceContext()
  const lap = getLap(currentYear, currentDriver, currentLap)
  if (!lap) return null

  const sev = lap.severity_pred
  const hex = getSeverityHex(sev)
  const label = getSeverityLabel(sev)

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-['DM_Sans'] text-[10px] text-[var(--text-muted)] tracking-[0.2em] uppercase">
          Degradation Severity
        </span>
        <span className="font-['Fira_Code'] text-[10px] text-[var(--text-muted)]">
          LAP {currentLap}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-full border-4 flex items-center justify-center shrink-0"
          style={{ borderColor: hex }}
        >
          <span className="font-['Rajdhani'] text-2xl font-bold text-[var(--text-primary)]">{sev}</span>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-['Rajdhani'] text-base font-semibold" style={{ color: hex }}>{label}</span>
          <span className="font-['DM_Sans'] text-xs text-[var(--text-muted)]">
            {lap.compound} · Tyre Life: {lap.tyre_life} laps
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-1">
        {[0, 1, 2, 3].map(level => (
          <div
            key={level}
            className="h-1 flex-1 rounded-full transition-colors duration-300"
            style={{ backgroundColor: level <= sev ? hex : 'var(--border)' }}
          />
        ))}
      </div>
    </div>
  )
}
