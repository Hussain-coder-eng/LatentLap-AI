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
    carEl.setAttribute('transform', `translate(${(point.x - 6).toFixed(2)}, ${(point.y - 11).toFixed(2)})`)
  }, [currentLap, totalLaps])

  const showCornerGlow = activeChapter === 2

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <defs>
        <filter id="silverstoneTrackGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={1.4} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Silverstone circuit trace */}
      <path
        ref={circuitRef}
        d={CIRCUIT_PATH_D}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.32}
        filter="url(#silverstoneTrackGlow)"
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
            opacity={0.45}
          />
        ))}

      {/* Car marker — compact top-down F1 silhouette, positioned via transform */}
      <g ref={carRef} data-testid="circuit-car-marker">
        <rect x={2.2} y={0.2} width={7.6} height={1.9} rx={0.35} fill="#1a1f24" />
        <rect x={1.1} y={18.6} width={9.8} height={2.4} rx={0.45} fill="#1a1f24" />
        <rect x={0.5} y={4.1} width={2.1} height={4.7} rx={0.8} fill="#111418" />
        <rect x={9.4} y={4.1} width={2.1} height={4.7} rx={0.8} fill="#111418" />
        <rect x={0.4} y={13.2} width={2.2} height={5.1} rx={0.85} fill="#111418" />
        <rect x={9.4} y={13.2} width={2.2} height={5.1} rx={0.85} fill="#111418" />
        <path
          d="M6 1.4 L8.1 4.6 L8.6 14.8 L6 20.8 L3.4 14.8 L3.9 4.6 Z"
          fill="#FF8000"
        />
        <path d="M4.3 5.1 L7.7 5.1 L7.2 13.1 L4.8 13.1 Z" fill="#ff9f2e" opacity={0.85} />
        <ellipse cx={6} cy={9.6} rx={1.25} ry={1.9} fill="#15191e" />
        <path d="M4.1 14.4 L7.9 14.4 L6.9 18.2 L5.1 18.2 Z" fill="#e86f00" />
        <path d="M4.6 3.3 L7.4 3.3" stroke="#ffd6a3" strokeWidth={0.55} strokeLinecap="round" />
        <path d="M5.1 15.4 L5.9 15.4 M6.5 16.3 L7.3 16.3" stroke="#1a1f24" strokeWidth={0.38} strokeLinecap="round" />
      </g>
    </svg>
  )
}
