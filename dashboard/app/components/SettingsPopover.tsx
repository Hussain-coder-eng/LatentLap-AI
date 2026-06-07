'use client'
import { useState, useRef, useEffect } from 'react'
import { useRaceContext } from '../RaceContext'
import { getDriversForYear } from '../../lib/data'

const YEARS = [2021, 2022, 2023, 2024, 2025] as const

export default function SettingsPopover() {
  const { currentYear, currentDriver, setCurrentYear, setCurrentDriver } = useRaceContext()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const inPopover = popoverRef.current?.contains(e.target as Node)
      const inPill = pillRef.current?.contains(e.target as Node)
      if (!inPopover && !inPill) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const drivers = getDriversForYear(currentYear)

  const handleYearSelect = (year: number) => {
    setCurrentYear(year)
    const availableDrivers = getDriversForYear(year)
    if (!availableDrivers.includes(currentDriver) && availableDrivers.length > 0) {
      setCurrentDriver(availableDrivers[0])
    }
  }

  return (
    <>
    <button
      ref={pillRef}
      onClick={() => setOpen(v => !v)}
      aria-label="Select year and driver"
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        zIndex: 300,
        background: 'rgba(255,128,0,0.15)',
        border: '1px solid rgba(255,128,0,0.4)',
        borderRadius: 12,
        padding: '4px 10px',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#FF8000',
        cursor: 'pointer',
      }}
    >
      {currentDriver} · {currentYear}
    </button>
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: 20, right: 20, zIndex: 300 }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open settings"
        aria-expanded={open}
        style={{
          background: 'rgba(8,8,8,0.90)',
          border: '1px solid #444',
          color: '#ccc',
          borderRadius: 6,
          width: 36,
          height: 36,
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⚙
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            background: 'rgba(12,12,12,0.97)',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '16px 20px',
            minWidth: 220,
            backdropFilter: 'blur(12px)',
          }}
        >
          <p
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: 11,
              color: '#888',
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            YEAR
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => handleYearSelect(y)}
                style={{
                  background: currentYear === y ? '#FF8000' : '#222',
                  color: currentYear === y ? '#000' : '#ccc',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontFamily: "'Fira Code', monospace",
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: currentYear === y ? 700 : 400,
                }}
              >
                {y}
              </button>
            ))}
          </div>

          <p
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: 11,
              color: '#888',
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            DRIVER
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {drivers.map(d => (
              <button
                key={d}
                onClick={() => setCurrentDriver(d)}
                style={{
                  background: currentDriver === d ? '#FF8000' : '#222',
                  color: currentDriver === d ? '#000' : '#ccc',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontFamily: "'Fira Code', monospace",
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: currentDriver === d ? 700 : 400,
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
