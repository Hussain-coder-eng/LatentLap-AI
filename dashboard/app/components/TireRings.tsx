'use client'
import { useEffect, useRef } from 'react'
import { animate, createTimeline, createDrawable, stagger } from 'animejs'
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
  const outerCircleRef = useRef<SVGCircleElement>(null)
  const middleCircleRef = useRef<SVGCircleElement>(null)
  const innerCircleRef = useRef<SVGCircleElement>(null)
  const spokeRefs = useRef<(SVGPathElement | null)[]>([])
  const tickRefs = useRef<(SVGPathElement | null)[]>([])
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const outer = outerRef.current
    const middle = middleRef.current
    const inner = innerRef.current
    if (!outer || !middle || !inner) return

    const rotations: ReturnType<typeof animate>[] = []
    const startRotations = () => {
      rotations.push(animate(outer, { rotate: 360, duration: 8000, loop: true, ease: 'linear' }))
      rotations.push(animate(middle, { rotate: -360, duration: 14000, loop: true, ease: 'linear' }))
      rotations.push(animate(inner, { rotate: 360, duration: 22000, loop: true, ease: 'linear' }))
    }

    if (reducedMotion) {
      outer.style.opacity = '1'
      middle.style.opacity = '1'
      inner.style.opacity = '1'
      startRotations()
      return () => rotations.forEach((rotation) => rotation.pause())
    }

    const outerCircle = outerCircleRef.current
    const middleCircle = middleCircleRef.current
    const innerCircle = innerCircleRef.current
    const spokes = spokeRefs.current.filter((el): el is SVGPathElement => el != null)
    const ticks = tickRefs.current.filter((el): el is SVGPathElement => el != null)
    if (!outerCircle || !middleCircle || !innerCircle) return

    let isDisposed = false
    const entrance = createTimeline()
      .add(outer, { opacity: [0, 1], duration: 900, ease: 'inOutExpo' }, 0)
      .add(createDrawable(outerCircle), { draw: ['0 0', '0 1'], opacity: [0, 1], duration: 900, ease: 'inOutExpo' }, 0)
      .add(middle, { opacity: [0, 1], duration: 900, ease: 'inOutExpo' }, '+300')
      .add(
        createDrawable(middleCircle),
        { draw: ['0 0', '0 1'], opacity: [0, 1], duration: 900, ease: 'inOutExpo' },
        '<',
      )
      .add(inner, { opacity: [0, 1], duration: 900, ease: 'inOutExpo' }, '+300')
      .add(
        createDrawable(innerCircle),
        { draw: ['0 0', '0 1'], opacity: [0, 1], duration: 900, ease: 'inOutExpo' },
        '<',
      )
      .add(spokes, { translateX: [-4, 0], opacity: [0, 1], duration: 80, delay: stagger(40) }, '<')
      .add(ticks, { translateY: [-6, 0], duration: 50, delay: stagger(20) }, '<')

    entrance.then(() => {
      if (!isDisposed) startRotations()
    })

    return () => {
      isDisposed = true
      entrance.pause()
      entrance.revert()
      rotations.forEach((rotation) => rotation.pause())
    }
  }, [reducedMotion])

  const spokePaths = buildSpokePaths(140, 80)
  const tickPaths = buildTickPaths(110, 8)

  return (
    <>
      {/* Outer ring — clockwise 8s */}
      <g ref={outerRef} style={{ transformOrigin: '200px 200px', opacity: 0 }}>
        <circle ref={outerCircleRef} cx={200} cy={200} r={170} fill="none" stroke={severityColor} strokeWidth={20} />
      </g>

      {/* Middle ring — counter-clockwise 14s with 6 spokes */}
      <g ref={middleRef} style={{ transformOrigin: '200px 200px', opacity: 0 }}>
        <circle
          ref={middleCircleRef}
          cx={200}
          cy={200}
          r={140}
          fill="none"
          stroke={severityColor}
          strokeWidth={12}
          opacity={0.5}
        />
        {spokePaths.map((d, i) => (
          <path
            key={i}
            ref={(el) => {
              spokeRefs.current[i] = el
            }}
            d={d}
            stroke={severityColor}
            strokeWidth={2}
            opacity={0.5}
            suppressHydrationWarning
          />
        ))}
      </g>

      {/* Inner ring — clockwise 22s with 8 tick marks */}
      <g ref={innerRef} style={{ transformOrigin: '200px 200px', opacity: 0 }}>
        <circle
          ref={innerCircleRef}
          cx={200}
          cy={200}
          r={110}
          fill="none"
          stroke={severityColor}
          strokeWidth={6}
          opacity={0.7}
        />
        {tickPaths.map((d, i) => (
          <path
            key={i}
            ref={(el) => {
              tickRefs.current[i] = el
            }}
            d={d}
            stroke={severityColor}
            strokeWidth={2}
            opacity={0.7}
            suppressHydrationWarning
          />
        ))}
      </g>

      {/* Center hub — severity number rendered here by parent */}
      <circle cx={200} cy={200} r={80} fill="#0a0a0a" />
    </>
  )
}
