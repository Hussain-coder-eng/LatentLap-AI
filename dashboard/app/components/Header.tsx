// app/components/Header.tsx
'use client'
import { useRef, useEffect, useState } from 'react'
import { useRaceContext } from '../RaceContext'
import { getDriversForYear } from '../../lib/data'
import { useReducedMotion } from '../../lib/useReducedMotion'

const LOGO_CHARS = 'LatentLap-AI'.split('')
const AVAILABLE_YEARS = [2021, 2022, 2023, 2024, 2025]
const TRACK_STYLES = ['A', 'B', 'C', 'D'] as const

export default function Header() {
  const { currentYear, currentDriver, trackStyle, setCurrentYear, setCurrentDriver, setActivePanelId, setTrackStyle } = useRaceContext()
  const reducedMotion = useReducedMotion()
  const charRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [controlsOpen, setControlsOpen] = useState(false)

  useEffect(() => {
    if (reducedMotion) return
    const els = charRefs.current.filter(Boolean) as HTMLSpanElement[]
    if (!els.length) return
    import('animejs').then(({ animate, stagger }) => {
      animate(els, { translateY: [20, 0], opacity: [0, 1], ease: 'outQuart', duration: 240, delay: stagger(30) })
    })
  }, [reducedMotion])

  const crossFadeThen = (fn: () => void) => {
    if (reducedMotion) { fn(); return }
    import('animejs').then(({ createTimeline }) => {
      const panels = Array.from(document.querySelectorAll('[data-panel-id]'))
      const tl = createTimeline({ defaults: { ease: 'inOutCubic', duration: 150 } })
      tl.add(panels, { opacity: [1, 0] }).add(panels, { opacity: [0, 1] })
      tl.onComplete = fn
    })
  }

  const drivers = getDriversForYear(currentYear)

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      {/* Row 1: Logo + desktop controls + mobile toggle */}
      <div className="flex items-center justify-between px-4 py-2 md:px-6 md:py-3">
        <div aria-label="LatentLap-AI" className="flex items-center gap-0.5">
          {LOGO_CHARS.map((char, i) => (
            <span key={i} ref={el => { charRefs.current[i] = el }}
              className="font-['Rajdhani'] font-bold text-xl text-[var(--mclaren)]" style={{ opacity: 0 }}>
              {char}
            </span>
          ))}
        </div>

        {/* Desktop: all controls in one row */}
        <div className="hidden md:flex items-center gap-4">
          <div className="flex gap-1">
            {TRACK_STYLES.map(s => (
              <button key={s} onClick={() => setTrackStyle(s)} aria-pressed={trackStyle === s}
                className={`w-7 h-7 rounded text-xs font-['Rajdhani'] font-bold border transition-colors focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2 ${
                  trackStyle === s ? 'bg-[var(--mclaren)] text-black border-[var(--mclaren)]'
                    : 'bg-transparent text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--mclaren)]'
                }`}>{s}</button>
            ))}
          </div>
          <select value={currentYear} onChange={e => crossFadeThen(() => setCurrentYear(Number(e.target.value)))}
            aria-label="Select year"
            className="bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 font-['DM_Sans'] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mclaren)]">
            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={currentDriver} onChange={e => crossFadeThen(() => setCurrentDriver(e.target.value))}
            aria-label="Select driver"
            className="bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 font-['DM_Sans'] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mclaren)]">
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => setActivePanelId(null)} aria-label="Reset camera to overview"
            className="px-2 py-1 border border-[var(--border)] text-[var(--text-muted)] text-xs font-['DM_Sans'] rounded hover:border-[var(--mclaren)] hover:text-[var(--mclaren)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2">
            Reset Camera
          </button>
        </div>

        {/* Mobile: toggle button for second row */}
        <button
          aria-label={controlsOpen ? 'Close controls' : 'Open controls'}
          aria-expanded={controlsOpen}
          onClick={() => setControlsOpen(v => !v)}
          className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] active:scale-95 transition-transform touch-manipulation focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2"
        >
          <span className={`text-[var(--text-muted)] text-sm transition-transform duration-200 ${controlsOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>
      </div>

      {/* Row 2: Mobile-only collapsible controls */}
      <div className={`md:hidden overflow-hidden transition-all duration-200 ${controlsOpen ? 'max-h-24' : 'max-h-0'}`}>
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] overflow-x-auto">
          <div className="flex gap-2 shrink-0">
            {TRACK_STYLES.map(s => (
              <button key={s} onClick={() => setTrackStyle(s)} aria-pressed={trackStyle === s}
                className={`w-11 h-11 rounded-lg text-sm font-['Rajdhani'] font-bold border touch-manipulation active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2 ${
                  trackStyle === s ? 'bg-[var(--mclaren)] text-black border-[var(--mclaren)]'
                    : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]'
                }`}>{s}</button>
            ))}
          </div>
          <select value={currentYear} onChange={e => crossFadeThen(() => { setCurrentYear(Number(e.target.value)); setControlsOpen(false) })}
            aria-label="Select year"
            className="h-11 bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] rounded px-3 font-['DM_Sans'] text-sm shrink-0">
            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={currentDriver} onChange={e => crossFadeThen(() => { setCurrentDriver(e.target.value); setControlsOpen(false) })}
            aria-label="Select driver"
            className="h-11 bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] rounded px-3 font-['DM_Sans'] text-sm shrink-0">
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
    </header>
  )
}
