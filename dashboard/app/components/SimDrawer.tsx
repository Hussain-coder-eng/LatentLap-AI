'use client'
import React, { useMemo } from 'react'
import { useRaceContext } from '../RaceContext'
import {
  computeSimResult,
  getAllLapsForDriver,
  COMPOUND_MULTIPLIERS,
  COMPOUND_COLORS,
  WET_COMPOUNDS,
  type CompoundKey,
} from '../../lib/data'

const ALL_COMPOUNDS: CompoundKey[] = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']
const COMPOUND_FULL_NAME: Record<CompoundKey, string> = {
  SOFT: 'Soft', MEDIUM: 'Medium', HARD: 'Hard', INTERMEDIATE: 'Intermediate', WET: 'Wet',
}

function CompoundChip({ compound }: { compound: string }) {
  const color = COMPOUND_COLORS[compound as CompoundKey] ?? '#888'
  const border = compound === 'HARD' ? '1px solid #999' : undefined
  return (
    <span style={{ borderRadius: '50%', width: 10, height: 10, display: 'inline-block', background: color, marginRight: 4, verticalAlign: 'middle', border }} />
  )
}

export default function SimDrawer() {
  const {
    currentYear, currentDriver,
    simCompound, simPitLap, simDrawerOpen,
    setSimCompound, setSimPitLap, setSimDrawerOpen,
  } = useRaceContext()

  const laps    = getAllLapsForDriver(currentYear, currentDriver)
  const lapNums = laps.map(l => l.lap_number)
  const minLap  = lapNums.length > 0 ? Math.min(...lapNums) + 1 : 2
  const maxLap  = lapNums.length > 0 ? Math.max(minLap, Math.max(...lapNums) - 1) : 50

  const result = useMemo(
    () => computeSimResult(currentYear, currentDriver, simPitLap, simCompound),
    [currentYear, currentDriver, simPitLap, simCompound]
  )

  const actualIsWet = WET_COMPOUNDS.has(result.actualCompound as CompoundKey)
  const isWet       = WET_COMPOUNDS.has(simCompound) && !actualIsWet
  const timeSaved  = result.timeDeltaSec
  const verdictPos = timeSaved > 0
  const verdictZero = Math.abs(timeSaved) < 0.05
  const verdictLabel = verdictZero
    ? 'No meaningful gain/loss'
    : verdictPos
      ? `SAVED ${timeSaved.toFixed(1)}s`
      : `LOST ${Math.abs(timeSaved).toFixed(1)}s`

  if (!simDrawerOpen) return null

  return (
    <div
      data-testid="sim-drawer"
      aria-label="Strategy simulator"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 320,
        height: '100dvh',
        background: '#0d1117',
        borderLeft: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        color: '#e0e0e0',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: '#FF8000' }}>
          LATENTLAP SIM
        </span>
        <button
          aria-label="Close simulator"
          onClick={() => setSimDrawerOpen(false)}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}
        >
          ✕
        </button>
      </div>

      {/* Controls */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, letterSpacing: 1 }}>COMPOUND</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_COMPOUNDS.map(c => (
              <button
                key={c}
                aria-pressed={simCompound === c}
                onClick={() => setSimCompound(c)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${simCompound === c ? COMPOUND_COLORS[c] : 'rgba(255,255,255,0.15)'}`,
                  background: simCompound === c ? `${COMPOUND_COLORS[c]}22` : 'transparent',
                  color: simCompound === c ? COMPOUND_COLORS[c] : '#888',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  fontWeight: simCompound === c ? 700 : 400,
                }}
              >
                <CompoundChip compound={c} />{COMPOUND_FULL_NAME[c]}
              </button>
            ))}
          </div>
          {isWet && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#FFD600' }}>
              ⚠ hypothetical — Silverstone {currentYear} was dry
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>PIT LAP</span>
            <span style={{ fontSize: 12, color: '#FF8000', fontWeight: 700 }}>L{simPitLap}</span>
          </div>
          <input
            aria-label="Sim pit lap"
            type="range"
            min={minLap}
            max={maxLap}
            value={simPitLap}
            onChange={e => setSimPitLap(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#FF8000' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 9, color: '#555' }}>L{minLap}</span>
            <span style={{ fontSize: 9, color: '#555' }}>L{maxLap}</span>
          </div>
        </div>
      </div>

      {/* Split comparison */}
      <div style={{ padding: '0 16px', flex: 1 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {['ACTUAL', 'YOUR SIM'].map((label, i) => (
            <div key={label} style={{
              padding: '8px 12px',
              background: i === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,128,0,0.08)',
              borderRight: i === 0 ? '1px solid rgba(255,255,255,0.08)' : undefined,
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
              color: i === 0 ? '#888' : '#FF8000',
            }}>
              {label}
            </div>
          ))}
          <Cell label="Compound" value={<><CompoundChip compound={result.actualCompound} />{COMPOUND_FULL_NAME[result.actualCompound as CompoundKey] ?? result.actualCompound}</>} isLeft />
          <Cell label="Compound" value={<><CompoundChip compound={simCompound} />{COMPOUND_FULL_NAME[simCompound]}</>} />
          <Cell label="Pit Lap" value={`L${result.actualPitLap}`} isLeft />
          <Cell label="Pit Lap" value={`L${simPitLap}`} />
          <Cell label="Projected finish severity" value={result.actualFinishSeverity.toFixed(2)} isLeft />
          <Cell
            label="Projected finish severity"
            value={result.simFinishSeverity.toFixed(2)}
            highlight={result.simFinishSeverity < result.actualFinishSeverity ? '#00E676' : '#FF1744'}
          />
          <Cell
            label="Compound degradation multiplier"
            value={`×${(COMPOUND_MULTIPLIERS[result.actualCompound as CompoundKey] ?? 1.0).toFixed(2)}`}
            isLeft
          />
          <Cell label="Compound degradation multiplier" value={`×${COMPOUND_MULTIPLIERS[simCompound].toFixed(2)}`} />
        </div>
      </div>

      {/* Verdict */}
      <div style={{ padding: 16 }}>
        <div style={{
          border: `1px solid ${verdictZero ? '#888' : verdictPos ? '#00E676' : '#FF1744'}`,
          borderRadius: 6,
          padding: '12px 16px',
          textAlign: 'center',
          background: verdictZero ? 'rgba(255,255,255,0.04)' : verdictPos ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: verdictZero ? '#888' : verdictPos ? '#00E676' : '#FF1744', letterSpacing: 1 }}>
            {verdictZero ? '—' : verdictPos ? '✓' : '✗'} {verdictLabel}
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
            vs actual strategy · {result.remainingLaps} laps projected
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({
  label, value, isLeft = false, highlight,
}: {
  label: string
  value: React.ReactNode
  isLeft?: boolean
  highlight?: string
}) {
  return (
    <div style={{
      padding: '10px 12px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      borderRight: isLeft ? '1px solid rgba(255,255,255,0.08)' : undefined,
      background: isLeft ? 'rgba(255,255,255,0.02)' : 'transparent',
    }}>
      <div style={{ fontSize: 9, color: '#555', marginBottom: 2, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: highlight ?? '#e0e0e0' }}>{value}</div>
    </div>
  )
}
