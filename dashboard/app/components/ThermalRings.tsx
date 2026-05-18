'use client'
import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

export interface ThermalRingsProps {
  severity: number
  severityColor: string
}

const RING_DURATION: Record<number, number> = { 0: 2200, 1: 1700, 2: 1300, 3: 1000 }

export function ThermalRings({ severity, severityColor }: ThermalRingsProps) {
  const ring1Ref = useRef<SVGCircleElement>(null)
  const ring2Ref = useRef<SVGCircleElement>(null)
  const ring3Ref = useRef<SVGCircleElement>(null)
  const reducedMotion = useReducedMotion()
  const clamped = Math.max(0, Math.min(3, Math.round(severity)))

  useEffect(() => {
    const rings = [ring1Ref.current, ring2Ref.current, ring3Ref.current]
    if (rings.some(r => r === null)) return

    if (reducedMotion) {
      rings.forEach((ring, i) => {
        if (ring) ring.style.opacity = String(0.15 - i * 0.04)
      })
      return
    }

    const duration = RING_DURATION[clamped]
    const anims = rings.map((ring, i) =>
      animate(ring!, {
        scale: [0.06, 1],
        opacity: [0.75, 0],
        duration,
        loop: true,
        delay: (duration / 3) * i,
      }),
    )

    return () => {
      anims.forEach(anim => anim.pause())
      rings.forEach(ring => {
        if (ring) {
          ring.style.transform = ''
          ring.style.opacity = '0'
        }
      })
    }
  }, [clamped, reducedMotion])

  const circleProps = {
    cx: 200,
    cy: 200,
    r: 170,
    fill: 'none',
    stroke: severityColor,
    style: { transformBox: 'fill-box' as const, transformOrigin: '50% 50%' },
    opacity: 0,
  }

  return (
    <>
      <circle ref={ring1Ref} {...circleProps} suppressHydrationWarning />
      <circle ref={ring2Ref} {...circleProps} suppressHydrationWarning />
      <circle ref={ring3Ref} {...circleProps} suppressHydrationWarning />
    </>
  )
}
