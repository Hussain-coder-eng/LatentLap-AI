'use client'
import { useEffect, useRef } from 'react'
import { animate, stagger, spring } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

interface TireParticlesProps {
  severity: number
  severityColor: string
}

const PARTICLE_CONFIG = {
  0: { count: 4, orbitR: 90, speed: 6000, eject: 0 },
  1: { count: 8, orbitR: 90, speed: 4000, eject: 0 },
  2: { count: 14, orbitR: 92, speed: 2800, eject: 0 },
  3: { count: 20, orbitR: 94, speed: 1800, eject: 4 },
} as const

type Sev = keyof typeof PARTICLE_CONFIG

export function TireParticles({ severity, severityColor }: TireParticlesProps) {
  const groupRef = useRef<SVGGElement>(null)
  const particleRefs = useRef<(SVGCircleElement | null)[]>([])
  const reducedMotion = useReducedMotion()

  const sev = Math.max(0, Math.min(3, Math.round(severity))) as Sev
  const cfg = PARTICLE_CONFIG[sev]

  useEffect(() => {
    if (reducedMotion) return

    const config = PARTICLE_CONFIG[sev]
    const anims: ReturnType<typeof animate>[] = []

    // Spring entrance for all particles on mount/severity change
    const allEls = particleRefs.current.slice(0, config.count).filter((el): el is SVGCircleElement => el != null)
    if (allEls.length > 0) {
      animate(allEls, {
        scale: [0, 1],
        opacity: [0, 1],
        ease: spring({ stiffness: 280, damping: 14 }) as unknown as string,
        duration: 0,
        delay: stagger(60, { from: 'first' }),
      })
    }

    for (let i = 0; i < config.count; i++) {
      const el = particleRefs.current[i]
      if (!el) continue

      const offsetAngle = (i / config.count) * Math.PI * 2
      const isEjecting = sev === 3 && i < config.eject

      if (isEjecting) {
        const sx = Math.cos(offsetAngle) * config.orbitR
        const sy = Math.sin(offsetAngle) * config.orbitR
        const ex = Math.cos(offsetAngle) * 200
        const ey = Math.sin(offsetAngle) * 200

        anims.push(
          animate(el, {
            keyframes: [
              { translateX: sx, translateY: sy, opacity: 1 },
              { translateX: ex, translateY: ey, opacity: 0 },
            ],
            duration: 1500,
            loop: true,
            ease: 'outQuad',
            delay: i * 300,
            composition: 'blend',
          } as Parameters<typeof animate>[1])
        )
      } else {
        // 60 cx/cy keyframe positions around the orbit circle
        const frames = Array.from({ length: 61 }, (_, f) => {
          const angle = offsetAngle + (f / 60) * Math.PI * 2
          return {
            translateX: Math.cos(angle) * config.orbitR,
            translateY: Math.sin(angle) * config.orbitR,
            duration: config.speed / 60,
            ease: 'linear' as const,
          }
        })
        anims.push(animate(el, { keyframes: frames, loop: true }))
      }
    }

    return () => {
      anims.forEach(a => a.pause())
    }
  }, [sev, reducedMotion])

  return (
    <g ref={groupRef}>
      {Array.from({ length: cfg.count }, (_, i) => (
        <circle
          key={i}
          ref={el => { particleRefs.current[i] = el }}
          cx={200}
          cy={200}
          r={3}
          fill={severityColor}
          opacity={1}
        />
      ))}
    </g>
  )
}
