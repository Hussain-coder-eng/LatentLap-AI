'use client'
import { useEffect, useRef } from 'react'
import { animate, createDrawable } from 'animejs'
import { buildCircuitPath, lapToCircuitProgress, CORNER_SVG } from '../../lib/circuitSvg'
import { getAllLapsForDriver } from '../../lib/data'
import { useRaceContext } from '../RaceContext'
import { useReducedMotion } from '../../lib/useReducedMotion'

interface SilverstoneCircuitProps {
  activeChapter: number
  topFeature?: string | null
}

// Build path once at module level — stable across renders
const CIRCUIT_PATH_D = buildCircuitPath()

export function SilverstoneCircuit({ activeChapter, topFeature: _topFeature }: SilverstoneCircuitProps) {
  const circuitRef = useRef<SVGPathElement>(null)
  const carRef = useRef<SVGGElement>(null)
  const reducedMotion = useReducedMotion()
  const { currentLap, currentYear, currentDriver } = useRaceContext()

  const allLaps = getAllLapsForDriver(currentYear, currentDriver)
  const totalLaps = Math.max(allLaps.length, 1)

  // Draw circuit in on mount; skip if reduced motion
  useEffect(() => {
    if (reducedMotion || !circuitRef.current) return
    animate(createDrawable(circuitRef.current), {
      draw: ['0 0', '0 1'],
      duration: 2000,
      ease: 'outCubic',
    })
  }, [reducedMotion])

  // Move car to current lap position along the path
  useEffect(() => {
    const pathEl = circuitRef.current
    const carEl = carRef.current
    if (!pathEl || !carEl) return

    const progress = lapToCircuitProgress(currentLap, totalLaps)
    const totalLength = pathEl.getTotalLength()
    const point = pathEl.getPointAtLength(progress * totalLength)
    // Offset by half car size so the car center lands on the path
    carEl.setAttribute('transform', `translate(${(point.x - 3).toFixed(2)}, ${(point.y - 5).toFixed(2)})`)
  }, [currentLap, totalLaps])

  const showCornerGlow = activeChapter === 2

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0.1,
        pointerEvents: 'none',
      }}
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      {/* Silverstone circuit trace */}
      <path
        ref={circuitRef}
        d={CIRCUIT_PATH_D}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Corner glow circles — Chapter 2 (Predictors) only */}
      {showCornerGlow &&
        Object.entries(CORNER_SVG).map(([name, pos]) => (
          <circle
            key={name}
            cx={pos.x}
            cy={pos.y}
            r={8}
            fill="none"
            stroke="#FF8000"
            strokeWidth={2}
            opacity={0.8}
          />
        ))}

      {/* Car marker — orange rect 6×10px, positioned via transform */}
      <g ref={carRef}>
        <rect width={6} height={10} rx={1} fill="#FF8000" />
      </g>
    </svg>
  )
}
