'use client'
import { useEffect, useRef } from 'react'
import { animate, createDrawable } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

export interface EKGPulseProps {
  severity: number
  severityColor: string
}

const PULSE_DURATION: Record<number, number> = { 0: 2000, 1: 1500, 2: 1100, 3: 800 }
const AMPLITUDE: Record<number, number> = { 0: 28, 1: 40, 2: 55, 3: 70 }

// 13-point (M + 12 L) two-beat EKG; all points within r=80 of center (200,200)
function buildPath(amplitude: number): string {
  const b = 200
  const A = amplitude
  const pts: [number, number][] = [
    [130, b],
    [148, b],
    [155, b + A * 0.2],
    [163, b - A],
    [167, b + A * 0.3],
    [175, b],
    [195, b],
    [213, b],
    [215, b + A * 0.2],
    [223, b - A],
    [227, b + A * 0.3],
    [235, b],
    [265, b],
  ]
  const [first, ...rest] = pts
  return `M ${first[0]} ${first[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ')
}

export function EKGPulse({ severity, severityColor }: EKGPulseProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const reducedMotion = useReducedMotion()
  const clamped = Math.max(0, Math.min(3, Math.round(severity)))
  const duration = PULSE_DURATION[clamped]

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    path.setAttribute('d', buildPath(AMPLITUDE[clamped]))
    if (reducedMotion) {
      path.style.opacity = '0.65'
      return
    }
    const drawable = createDrawable(path)
    const anim = animate(drawable, {
      draw: ['0 0', '0 1'],
      duration,
      ease: 'linear',
      loop: true,
    })
    return () => {
      anim.pause()
      drawable.forEach(d => { d.setAttribute('draw', '0 0') })
    }
  }, [clamped, duration, reducedMotion])

  return (
    <g>
      <defs>
        <clipPath id="ekg-hub-clip">
          <circle cx={200} cy={200} r={78} />
        </clipPath>
      </defs>
      <g clipPath="url(#ekg-hub-clip)">
        <line x1={120} y1={185} x2={280} y2={185} stroke="#131313" strokeWidth={1} />
        <line x1={120} y1={200} x2={280} y2={200} stroke="#1a1a1a" strokeWidth={1} />
        <line x1={120} y1={215} x2={280} y2={215} stroke="#131313" strokeWidth={1} />
        <path
          ref={pathRef}
          d={buildPath(AMPLITUDE[clamped])}
          fill="none"
          stroke={severityColor}
          strokeWidth={2.2}
          suppressHydrationWarning
        />
      </g>
    </g>
  )
}
