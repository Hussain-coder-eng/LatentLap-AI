// app/components/LapScrubber.tsx
'use client'
import { useRef, useCallback, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getLapRange } from '../../lib/data'
import { useReducedMotion } from '../../lib/useReducedMotion'

export default function LapScrubber() {
  const { currentLap, currentYear, currentDriver, setCurrentLap } = useRaceContext()
  const [minLap, maxLap] = getLapRange(currentYear, currentDriver)
  const reducedMotion = useReducedMotion()
  const replayRef = useRef<{ pause: () => void } | null>(null)

  // Keyboard navigation — NO animation (high-frequency, arrow keys)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrentLap(Math.min(currentLap + 1, maxLap))
      if (e.key === 'ArrowLeft')  setCurrentLap(Math.max(currentLap - 1, minLap))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentLap, minLap, maxLap, setCurrentLap])

  // Cancel replay on year/driver change or unmount
  useEffect(() => {
    return () => { replayRef.current?.pause() }
  }, [currentYear, currentDriver])

  // Replay: single Anime.js v4 createTimeline, one .add() per lap at 800ms intervals
  const startReplay = useCallback(() => {
    if (reducedMotion) return
    replayRef.current?.pause()
    // Anime.js v4: createTimeline (NOT anime.timeline())
    import('animejs').then(({ createTimeline }) => {
      const lapRef = { value: minLap }
      const lapRange = Array.from({ length: maxLap - minLap + 1 }, (_, i) => minLap + i)
      const tl = createTimeline({ defaults: { ease: 'outQuart', duration: 400 } })
      lapRange.forEach((lap, i) => { tl.add(lapRef, { value: lap }, i * 800) })
      tl.onUpdate = () => setCurrentLap(Math.round(lapRef.value))
      replayRef.current = tl
    })
  }, [minLap, maxLap, setCurrentLap, reducedMotion])

  return (
    <div className="flex items-center gap-3 px-4 py-2" data-panel-id="scrubber" aria-label="Lap scrubber">
      <span className="font-['Rajdhani'] text-sm text-[var(--text-muted)]">
        LAP {currentLap}/{maxLap}
      </span>
      <input
        type="range" min={minLap} max={maxLap} value={currentLap}
        onChange={e => setCurrentLap(Number(e.target.value))}
        aria-label={`Lap scrubber, lap ${currentLap} of ${maxLap}`}
        className="flex-1 cursor-pointer touch-manipulation active:scale-[0.97] transition-transform"
        style={{ accentColor: 'var(--mclaren)' }}
      />
      <button
        onClick={startReplay}
        aria-label="Replay race"
        className="px-3 py-1 bg-[var(--mclaren)] text-black font-['Rajdhani'] font-bold text-sm rounded hover:opacity-90 transition-opacity touch-manipulation active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-[var(--mclaren)] focus-visible:outline-offset-2"
      >
        ▶ Replay
      </button>
    </div>
  )
}
