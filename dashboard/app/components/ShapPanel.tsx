// app/components/ShapPanel.tsx
'use client'
import { useRef, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getSHAP } from '../../lib/data'
import { useReducedMotion } from '../../lib/useReducedMotion'

// Anime.js v4: animate + stagger — scaleX from 0→1 with stagger(40)

const FEATURE_LABELS: Record<string, string> = {
  MB_PeakLatG:    'Maggotts-Becketts Peak G',
  MB_TimeSec:     'Maggotts-Becketts Sector Time',
  Copse_PeakLatG: 'Copse Peak Lateral G',
  Copse_TimeSec:  'Copse Sector Time',
  Club_TimeSec:   'Club Sector Time',
  Stowe_PeakLatG: 'Stowe Peak Lateral G',
  TyreLife:       'Tyre Age (laps)',
  AirTemp:        'Air Temperature',
  TrackTemp:      'Track Temperature',
  AggressionZ:    'Driving Aggression Index',
}
const humanReadable = (f: string) => FEATURE_LABELS[f] ?? f.replace(/_/g, ' ')

export default function ShapPanel() {
  const { currentLap, currentYear, currentDriver, setActivePanelId, setTopSHAPFeature } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const barRefs = useRef<(HTMLDivElement | null)[]>([])

  const shapEntry = getSHAP(currentYear, currentDriver, currentLap)
  const top3 = shapEntry
    ? Object.entries(shapEntry).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)
    : []

  useEffect(() => { setTopSHAPFeature(top3[0]?.[0] ?? null) }, [top3, setTopSHAPFeature])

  const maxAbs = top3.length > 0 ? Math.max(...top3.map(([, v]) => Math.abs(v))) : 1

  // Anime.js v4: stagger entrance on lap change
  useEffect(() => {
    if (reducedMotion) return
    const els = barRefs.current.filter(Boolean) as HTMLDivElement[]
    if (!els.length) return
    import('animejs').then(({ animate, stagger }) => {
      animate(els, {
        scaleX: [0, 1],
        transformOrigin: ['left center', 'left center'],
        ease: 'outQuart',
        duration: 240,
        delay: stagger(40),
      })
    })
  }, [currentLap, currentYear, currentDriver, reducedMotion])

  return (
    <section data-panel-id="shap" onFocus={() => setActivePanelId('shap')} tabIndex={0}
      aria-label="SHAP feature explanation panel"
      className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2">
      <p className="font-['DM_Sans'] text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
        Top Predictors — Lap {currentLap}
      </p>

      {top3.length === 0 ? (
        <p className="font-['DM_Sans'] text-sm text-[var(--text-muted)]">No SHAP data available.</p>
      ) : (
        <div className="space-y-3">
          {top3.map(([feature, value], i) => {
            const pct = (Math.abs(value) / maxAbs) * 100
            const barColor = value >= 0 ? 'var(--mclaren)' : '#2979FF'
            return (
              <div key={feature}>
                <div className="flex justify-between mb-0.5">
                  <span className="font-['Fira_Code'] text-xs text-[var(--text-primary)]">{humanReadable(feature)}</span>
                  <span className="font-['Rajdhani'] text-sm" style={{ color: barColor }}>
                    {value >= 0 ? '+' : ''}{value.toFixed(3)}
                  </span>
                </div>
                <div className="h-2 bg-[var(--surface-2)] rounded overflow-hidden">
                  <div ref={el => { barRefs.current[i] = el }}
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                    className="h-full rounded"
                    role="progressbar"
                    aria-valuenow={Math.round(Math.abs(value) * 1000) / 1000}
                    aria-label={`Feature: ${humanReadable(feature)}, contribution: ${value >= 0 ? '+' : ''}${value.toFixed(3)}`} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
