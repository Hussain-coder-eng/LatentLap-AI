'use client'
import { useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getAllLapsForDriver } from '../../lib/data'

export default function LapScrubberFixed() {
  const { currentLap, currentYear, currentDriver, setCurrentLap } = useRaceContext()
  const laps = getAllLapsForDriver(currentYear, currentDriver)
  const lapNums = laps.map(l => l.lap_number)
  const minLap = lapNums.length > 0 ? Math.min(...lapNums) : 1
  const maxLap = lapNums.length > 0 ? Math.max(...lapNums) : 1

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrentLap(Math.min(currentLap + 1, maxLap))
      if (e.key === 'ArrowLeft')  setCurrentLap(Math.max(currentLap - 1, minLap))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentLap, minLap, maxLap, setCurrentLap])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: 48,
        background: 'rgba(8,8,8,0.95)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 20px',
      }}
      aria-label="Lap scrubber"
    >
      <span
        style={{
          fontFamily: "'Fira Code', monospace",
          fontSize: 13,
          color: '#ccc',
          whiteSpace: 'nowrap',
          minWidth: 90,
        }}
      >
        LAP {currentLap} / {maxLap}
      </span>

      <button
        onClick={() => setCurrentLap(Math.max(currentLap - 1, minLap))}
        aria-label="Previous lap"
        style={{
          background: 'transparent',
          border: '1px solid #444',
          color: '#ccc',
          borderRadius: 4,
          padding: '2px 10px',
          cursor: 'pointer',
          fontFamily: "'Fira Code', monospace",
          fontSize: 13,
          lineHeight: '22px',
        }}
      >
        ◀
      </button>

      <input
        type="range"
        min={minLap}
        max={maxLap}
        value={currentLap}
        onChange={e => setCurrentLap(Number(e.target.value))}
        aria-label={`Lap ${currentLap} of ${maxLap}`}
        style={{ flex: 1, accentColor: '#FF8000', cursor: 'pointer' }}
      />

      <button
        onClick={() => setCurrentLap(Math.min(currentLap + 1, maxLap))}
        aria-label="Next lap"
        style={{
          background: 'transparent',
          border: '1px solid #444',
          color: '#ccc',
          borderRadius: 4,
          padding: '2px 10px',
          cursor: 'pointer',
          fontFamily: "'Fira Code', monospace",
          fontSize: 13,
          lineHeight: '22px',
        }}
      >
        ▶
      </button>
    </div>
  )
}
