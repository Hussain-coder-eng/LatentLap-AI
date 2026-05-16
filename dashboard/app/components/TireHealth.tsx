// app/components/TireHealth.tsx
'use client'
import { useRef, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getLap } from '../../lib/data'
import { getSeverityHex, getSeverityLabel } from '../../lib/severityColors'
import { useReducedMotion } from '../../lib/useReducedMotion'

// Anime.js v4: animate + utils.round(0) for integer counter

const MODE_KEYS = ['blistering', 'none', 'thermal', 'wear'] as const
const MODE_LABELS: Record<string, string> = { blistering: 'Blistering', none: 'No Failure', thermal: 'Thermal', wear: 'Wear' }

export default function TireHealth() {
  const { currentLap, currentYear, currentDriver, setActivePanelId } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const counterRef = useRef<{ value: number }>({ value: 0 })
  const displayRef = useRef<HTMLSpanElement>(null)
  const animRef = useRef<any>(null)
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({ blistering: null, none: null, thermal: null, wear: null })

  const lap = getLap(currentYear, currentDriver, currentLap)

  useEffect(() => {
    if (!lap || !displayRef.current) return
    if (reducedMotion) { displayRef.current.textContent = String(lap.severity_pred); return }

    // Interrupt previous counter, restart
    animRef.current?.pause()
    counterRef.current.value = Number(displayRef.current.textContent ?? 0)

    // Anime.js v4: utils.round(0) + ease: 'outExpo' (NOT easing: 'easeOutExpo')
    import('animejs').then(({ animate, utils }) => {
      animRef.current = animate(counterRef.current, {
        value: lap.severity_pred,
        modifier: utils.round(0),
        ease: 'outExpo',
        duration: 600,
        onUpdate: () => { if (displayRef.current) displayRef.current.textContent = String(counterRef.current.value) },
      })
    })

    // Animate mode bars
    if (lap.mode_probs) {
      const maxProb = Math.max(...Object.values(lap.mode_probs))
      MODE_KEYS.forEach(mode => {
        const bar = barRefs.current[mode]
        if (!bar) return
        const pct = maxProb > 0 ? (lap.mode_probs[mode] / maxProb) * 100 : 0
        import('animejs').then(({ animate }) => {
          animate(bar, { width: `${pct}%`, ease: 'inOutCubic', duration: 240 })
        })
      })
    }
  }, [currentLap, currentYear, currentDriver, lap, reducedMotion])

  if (!lap) return (
    <section data-panel-id="tire-health" aria-label="Tire health panel" tabIndex={0}
      className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">Tire Severity</p>
      <p className="font-['DM_Sans'] text-sm text-[var(--text-muted)]">No data for this lap.</p>
    </section>
  )

  const sevColor = getSeverityHex(lap.severity_pred)
  const isCritical = lap.severity_pred >= 3

  return (
    <section data-panel-id="tire-health" onFocus={() => setActivePanelId('tire-health')} tabIndex={0}
      aria-label="Tire health panel"
      className={`p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2 ${
        isCritical ? 'animate-[glow-pulse_1.2s_ease_infinite]' : ''
      }`}>
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">Tire Severity</p>

      <div className="flex items-baseline gap-2 mb-2">
        <span ref={displayRef} className="font-['Rajdhani'] font-bold text-6xl leading-none"
          style={{ color: sevColor }} aria-live="polite" aria-label={`Severity ${lap.severity_pred}`}>
          {lap.severity_pred}
        </span>
        <span className="font-['Rajdhani'] text-2xl text-[var(--text-muted)]">/3</span>
      </div>

      <p className="font-['DM_Sans'] text-sm mb-3" style={{ color: sevColor }}>
        {getSeverityLabel(lap.severity_pred)}
        {isCritical && <span className="ml-2 text-xs text-[var(--text-muted)]">heuristic proxy — not a physical tire sensor</span>}
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/media/mclaren_car_front.webp" alt="McLaren F1 car"
        className="w-full h-20 object-contain mb-3"
        style={{ filter: `hue-rotate(${lap.severity_pred * 30}deg)` }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />

      <div className="space-y-2">
        {MODE_KEYS.map(mode => (
          <div key={mode} className="space-y-0.5">
            <div className="flex justify-between text-xs font-['DM_Sans'] text-[var(--text-muted)]">
              <span>{MODE_LABELS[mode]}</span>
              <span className="font-['Fira_Code']">{(lap.mode_probs[mode] * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-[var(--surface-2)] rounded overflow-hidden">
              <div ref={el => { barRefs.current[mode] = el }}
                className="h-full bg-[var(--mclaren)] rounded" style={{ width: '0%' }}
                role="progressbar" aria-valuenow={Math.round(lap.mode_probs[mode] * 100)}
                aria-valuemin={0} aria-valuemax={100}
                aria-label={`${MODE_LABELS[mode]} probability`} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
