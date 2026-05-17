'use client'
import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

interface TireRingsProps {
  severityColor: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

// 6 spoke paths for middle ring at 60° intervals
function buildSpokePaths(outerR: number, innerR: number): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 * Math.PI) / 180
    const x1 = r2(200 + Math.cos(angle) * innerR)
    const y1 = r2(200 + Math.sin(angle) * innerR)
    const x2 = r2(200 + Math.cos(angle) * outerR)
    const y2 = r2(200 + Math.sin(angle) * outerR)
    return `M ${x1} ${y1} L ${x2} ${y2}`
  })
}

// 8 tick marks for inner ring at 45° intervals
function buildTickPaths(r: number, tickLen: number): string[] {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 45 * Math.PI) / 180
    const x1 = r2(200 + Math.cos(angle) * (r - tickLen))
    const y1 = r2(200 + Math.sin(angle) * (r - tickLen))
    const x2 = r2(200 + Math.cos(angle) * r)
    const y2 = r2(200 + Math.sin(angle) * r)
    return `M ${x1} ${y1} L ${x2} ${y2}`
  })
}

export function TireRings({ severityColor }: TireRingsProps) {
  const outerRef = useRef<SVGGElement>(null)
  const middleRef = useRef<SVGGElement>(null)
  const innerRef = useRef<SVGGElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return

    const outer = outerRef.current
    const middle = middleRef.current
    const inner = innerRef.current
    if (!outer || !middle || !inner) return

    animate(outer, { rotate: 360, duration: 8000, loop: true, ease: 'linear' })
    animate(middle, { rotate: -360, duration: 14000, loop: true, ease: 'linear' })
    animate(inner, { rotate: 360, duration: 22000, loop: true, ease: 'linear' })
  }, [reducedMotion])

  const spokePaths = buildSpokePaths(140, 80)
  const tickPaths = buildTickPaths(110, 8)

  return (
    <>
      {/* Outer ring — clockwise 8s */}
      <g ref={outerRef} style={{ transformOrigin: '200px 200px' }}>
        <circle cx={200} cy={200} r={170} fill="none" stroke={severityColor} strokeWidth={20} />
      </g>

      {/* Middle ring — counter-clockwise 14s with 6 spokes */}
      <g ref={middleRef} style={{ transformOrigin: '200px 200px' }}>
        <circle cx={200} cy={200} r={140} fill="none" stroke={severityColor} strokeWidth={12} opacity={0.5} />
        {spokePaths.map((d, i) => (
          <path key={i} d={d} stroke={severityColor} strokeWidth={2} opacity={0.5} suppressHydrationWarning />
        ))}
      </g>

      {/* Inner ring — clockwise 22s with 8 tick marks */}
      <g ref={innerRef} style={{ transformOrigin: '200px 200px' }}>
        <circle cx={200} cy={200} r={110} fill="none" stroke={severityColor} strokeWidth={6} opacity={0.7} />
        {tickPaths.map((d, i) => (
          <path key={i} d={d} stroke={severityColor} strokeWidth={2} opacity={0.7} suppressHydrationWarning />
        ))}
      </g>

      {/* Center hub — severity number rendered here by parent */}
      <circle cx={200} cy={200} r={80} fill="#0a0a0a" />
    </>
  )
}
