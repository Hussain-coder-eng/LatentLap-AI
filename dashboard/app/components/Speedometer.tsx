'use client'
import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

const GAUGE_CENTER = 60
const GAUGE_RADIUS = 45
const NEEDLE_MIN_DEG = -135
const NEEDLE_MAX_DEG = 135
const MAX_SPEED_PX_MS = 4
const DECAY_DELAY_MS = 100
const DECAY_DURATION_MS = 1200
const NEEDLE_ANIM_MS = 80

// Convert rotation angle (0=up, clockwise positive) to SVG canvas point
function angleToPoint(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [
    GAUGE_CENTER + r * Math.sin(rad),
    GAUGE_CENTER - r * Math.cos(rad),
  ]
}

// 270° arc from -135° to +135°, clockwise over the top of the dial
function buildArcPath(): string {
  const [sx, sy] = angleToPoint(NEEDLE_MIN_DEG, GAUGE_RADIUS)
  const [ex, ey] = angleToPoint(NEEDLE_MAX_DEG, GAUGE_RADIUS)
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
}

const TICK_DEFS = [
  { deg: -135, label: '0' },
  { deg: -45, label: '100' },
  { deg: 45, label: '200' },
  { deg: 135, label: '300' },
] as const

export function Speedometer() {
  const needleRef = useRef<SVGGElement>(null)
  const speedTextRef = useRef<SVGTextElement>(null)
  const reducedMotion = useReducedMotion()
  const reducedRef = useRef(reducedMotion)

  useEffect(() => {
    reducedRef.current = reducedMotion
  }, [reducedMotion])

  // Set needle to minimum position immediately on mount
  useEffect(() => {
    if (needleRef.current) {
      animate(needleRef.current, { rotate: NEEDLE_MIN_DEG, duration: 0 })
    }
  }, [])

  useEffect(() => {
    let lastY = window.scrollY
    let lastTime = performance.now()
    let decayTimer: ReturnType<typeof setTimeout> | null = null

    const onScroll = () => {
      const now = performance.now()
      const deltaY = Math.abs(window.scrollY - lastY)
      const deltaTime = Math.max(now - lastTime, 1)
      lastY = window.scrollY
      lastTime = now

      const speedPxMs = deltaY / deltaTime
      const clamped = Math.min(speedPxMs, MAX_SPEED_PX_MS)
      const deg = NEEDLE_MIN_DEG + (clamped / MAX_SPEED_PX_MS) * (NEEDLE_MAX_DEG - NEEDLE_MIN_DEG)
      const kmh = Math.round((clamped / MAX_SPEED_PX_MS) * 300)

      if (!reducedRef.current && needleRef.current) {
        animate(needleRef.current, { rotate: deg, duration: NEEDLE_ANIM_MS, ease: 'outQuad' })
      }
      if (speedTextRef.current) {
        speedTextRef.current.textContent = String(kmh)
      }

      if (decayTimer) clearTimeout(decayTimer)
      decayTimer = setTimeout(() => {
        if (!reducedRef.current && needleRef.current) {
          animate(needleRef.current, { rotate: NEEDLE_MIN_DEG, duration: DECAY_DURATION_MS, ease: 'outExpo' })
        }
        if (speedTextRef.current) {
          speedTextRef.current.textContent = '0'
        }
      }, DECAY_DELAY_MS)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (decayTimer) clearTimeout(decayTimer)
    }
  }, [])

  const arcPath = buildArcPath()

  return (
    <div
      style={{ position: 'fixed', top: 24, left: 24, zIndex: 60, width: 120, height: 120 }}
      aria-label="Scroll speed gauge"
    >
      <svg width={120} height={120} viewBox="0 0 120 120">
        {/* Dial background */}
        <circle cx={GAUGE_CENTER} cy={GAUGE_CENTER} r={57} fill="#0a0a0a" stroke="#222" strokeWidth={1} />

        {/* Arc track */}
        <path d={arcPath} fill="none" stroke="#333" strokeWidth={4} strokeLinecap="round" />

        {/* Tick marks and km/h labels */}
        {TICK_DEFS.map(({ deg, label }) => {
          const [ox, oy] = angleToPoint(deg, GAUGE_RADIUS)
          const [ix, iy] = angleToPoint(deg, GAUGE_RADIUS - 7)
          const [lx, ly] = angleToPoint(deg, GAUGE_RADIUS - 17)
          return (
            <g key={deg}>
              <line x1={ox} y1={oy} x2={ix} y2={iy} stroke="#888" strokeWidth={1.5} strokeLinecap="round" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="'Fira Code', monospace"
                fontSize={6}
                fill="#888"
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* Needle */}
        <g ref={needleRef} style={{ transformOrigin: `${GAUGE_CENTER}px ${GAUGE_CENTER}px` }}>
          <line
            x1={GAUGE_CENTER}
            y1={GAUGE_CENTER + 5}
            x2={GAUGE_CENTER}
            y2={GAUGE_CENTER - 38}
            stroke="#FF8000"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>

        {/* Center cap */}
        <circle cx={GAUGE_CENTER} cy={GAUGE_CENTER} r={5} fill="#FF8000" />

        {/* Speed readout */}
        <text
          ref={speedTextRef}
          x={GAUGE_CENTER}
          y={GAUGE_CENTER + 20}
          textAnchor="middle"
          dominantBaseline="auto"
          fontFamily="'Fira Code', monospace"
          fontSize={11}
          fill="#ffffff"
        >
          0
        </text>
        <text
          x={GAUGE_CENTER}
          y={GAUGE_CENTER + 30}
          textAnchor="middle"
          dominantBaseline="auto"
          fontFamily="'Fira Code', monospace"
          fontSize={6}
          fill="#888"
        >
          km/h
        </text>
      </svg>
    </div>
  )
}
