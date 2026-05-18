'use client'
import { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

interface TireParticlesProps {
  severity: number
  severityColor: string
}

const PARTICLE_CONFIG = {
  0: { count: 4, orbitR: 72, speed: 7000 },
  1: { count: 8, orbitR: 80, speed: 5000 },
  2: { count: 14, orbitR: 88, speed: 3400 },
  3: { count: 20, orbitR: 96, speed: 2200 },
} as const

type Sev = keyof typeof PARTICLE_CONFIG
type AnimeAnimation = ReturnType<typeof animate> & {
  cancel?: () => void
  revert?: () => void
}

const PARTICLE_RADIUS = 3
const ORBIT_FRAME_COUNT = 72
const CENTER = 200

function setParticlePosition(el: SVGCircleElement, angle: number, radius: number): void {
  el.style.transform = `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`
  el.style.transformOrigin = `${CENTER}px ${CENTER}px`
}

function resetParticle(el: SVGCircleElement, opacity = '1'): void {
  el.style.transform = ''
  el.style.opacity = opacity
  el.style.scale = ''
  el.style.transformOrigin = `${CENTER}px ${CENTER}px`
  el.setAttribute('transform', '')
  el.setAttribute('opacity', opacity)
  el.setAttribute('r', String(PARTICLE_RADIUS))
}

function stopAnimation(anim: AnimeAnimation): void {
  anim.pause()
  anim.cancel?.()
  anim.revert?.()
}

export function TireParticles({ severity, severityColor }: TireParticlesProps) {
  const groupRef = useRef<SVGGElement>(null)
  const particleRefs = useRef<(SVGCircleElement | null)[]>([])
  const reducedMotion = useReducedMotion()

  const sev = Math.max(0, Math.min(3, Math.round(severity))) as Sev
  const cfg = PARTICLE_CONFIG[sev]

  useEffect(() => {
    const config = PARTICLE_CONFIG[sev]
    const anims: AnimeAnimation[] = []
    const activeEls = particleRefs.current.slice(0, config.count).filter((el): el is SVGCircleElement => el != null)
    const inactiveEls = particleRefs.current.slice(config.count).filter((el): el is SVGCircleElement => el != null)

    inactiveEls.forEach(el => resetParticle(el, '0'))

    activeEls.forEach((el, i) => {
      const offsetAngle = (i / config.count) * Math.PI * 2
      resetParticle(el)
      setParticlePosition(el, offsetAngle, config.orbitR)
    })

    if (reducedMotion) {
      return () => {
        activeEls.forEach(el => resetParticle(el))
        inactiveEls.forEach(el => resetParticle(el, '0'))
      }
    }

    // Spring entrance for all particles on mount/severity change
    if (activeEls.length > 0) {
      anims.push(animate(activeEls, {
        opacity: [0, 1],
        r: [0, PARTICLE_RADIUS],
        ease: 'outExpo',
        duration: 420,
        delay: stagger(60, { from: 'first' }),
      }) as AnimeAnimation)
    }

    for (let i = 0; i < config.count; i++) {
      const el = particleRefs.current[i]
      if (!el) continue

      const offsetAngle = (i / config.count) * Math.PI * 2
      const frames = Array.from({ length: ORBIT_FRAME_COUNT + 1 }, (_, f) => {
        const angle = offsetAngle + (f / ORBIT_FRAME_COUNT) * Math.PI * 2
        return {
          translateX: Math.cos(angle) * config.orbitR,
          translateY: Math.sin(angle) * config.orbitR,
          duration: config.speed / ORBIT_FRAME_COUNT,
          ease: 'linear' as const,
        }
      })
      anims.push(animate(el, { keyframes: frames, loop: true }) as AnimeAnimation)
    }

    return () => {
      anims.forEach(stopAnimation)
      activeEls.forEach(el => resetParticle(el))
      inactiveEls.forEach(el => resetParticle(el, '0'))
    }
  }, [sev, reducedMotion])

  return (
    <g ref={groupRef}>
      {Array.from({ length: cfg.count }, (_, i) => (
        <circle
          key={i}
          data-testid="tire-particle"
          ref={el => { particleRefs.current[i] = el }}
          cx={CENTER}
          cy={CENTER}
          r={PARTICLE_RADIUS}
          fill={severityColor}
          opacity={1}
        />
      ))}
    </g>
  )
}
