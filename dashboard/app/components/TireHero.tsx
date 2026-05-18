'use client'
import { useEffect, useRef } from 'react'
import { animate, createAnimatable, spring, createTimeline } from 'animejs'
import { getLap } from '../../lib/data'
import { getSeverityHex } from '../../lib/severityColors'
import { useRaceContext } from '../RaceContext'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { TireRings } from './TireRings'
import { TireTread } from './TireTread'
import { TireParticles } from './TireParticles'

interface TireHeroProps {
  scrollProgress: number
}

// Hardcoded hex — CSS var() not resolved in SVG presentation attributes
const COMPOUND_COLOR: Record<string, string> = {
  SOFT: '#E8002D',
  MEDIUM: '#FFC906',
  HARD: '#FFFFFF',
}

const GLOW_DURATION: Record<number, string> = { 0: '3s', 1: '2s', 2: '1.5s', 3: '1.2s' }

export default function TireHero({ scrollProgress }: TireHeroProps) {
  const { currentLap, currentYear, currentDriver } = useRaceContext()
  const reducedMotion = useReducedMotion()

  const lap = getLap(currentYear, currentDriver, currentLap)
  const severity = Math.min(3, Math.max(0, lap ? Math.round(lap.severity_pred) : 0))
  const compound = lap?.compound ?? 'SOFT'
  const severityColor = getSeverityHex(severity)
  const compoundColor = COMPOUND_COLOR[compound] ?? COMPOUND_COLOR.SOFT

  // plain object that animejs mutates; we read it in onUpdate to set SVG text
  const counterObj = useRef<{ v: number }>({ v: 0 })
  const counterRef = useRef<SVGTextElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const animRotRef = useRef<ReturnType<typeof createAnimatable> | null>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const prevSeverityRef = useRef(severity)
  const fadeOutRef = useRef<ReturnType<typeof animate> | null>(null)
  const fadeInRef = useRef<ReturnType<typeof animate> | null>(null)
  const latestGlowState = useRef({ severity, severityColor })

  // Keep latestGlowState current so the async fade-out callback reads the latest severity/color
  useEffect(() => {
    latestGlowState.current = { severity, severityColor }
  })

  useEffect(() => {
    if (!counterRef.current) return
    if (reducedMotion) {
      counterRef.current.textContent = String(severity)
      counterObj.current.v = severity
      return
    }
    const anim = animate(counterObj.current as unknown as Parameters<typeof animate>[0], {
      v: severity,
      ease: spring({ stiffness: 300, damping: 22 }),
      duration: 600,
      onUpdate: () => {
        if (counterRef.current) {
          counterRef.current.textContent = String(Math.round(counterObj.current.v))
        }
      },
    })
    return () => { anim.pause() }
  }, [severity, reducedMotion])

  // Mount-time animatable setup for scroll-driven rotation
  useEffect(() => {
    if (!svgRef.current || reducedMotion) return
    animRotRef.current = createAnimatable(svgRef.current, {
      rotate: { duration: 400, ease: 'outExpo' },
    } as Parameters<typeof createAnimatable>[1])
    return () => {
      animRotRef.current?.revert()
      animRotRef.current = null
    }
  }, [reducedMotion])

  // Apply scroll rotation via animatable
  useEffect(() => {
    if (reducedMotion) return
    animRotRef.current?.rotate(scrollProgress * 720)
  }, [scrollProgress, reducedMotion])

  // Entrance timeline — runs once on mount (or when reducedMotion changes)
  useEffect(() => {
    if (reducedMotion) return
    const tl = createTimeline({ autoplay: true })
    if (glowRef.current) {
      // Start glow fade-in at t=0, before SVG scale (no negative offset on first add)
      tl.add(glowRef.current, { opacity: [0, 1], duration: 400, ease: 'outExpo' }, 0)
    }
    if (svgRef.current) {
      tl.add(svgRef.current, { scale: [0.85, 1], duration: 500, ease: 'outBack' }, 0)
    }
    if (counterRef.current) {
      tl.add(counterRef.current, { opacity: [0, 1], duration: 300 }, '+=200')
    }
    return () => { tl.pause(); tl.revert() }
  }, [reducedMotion])

  // Glow crossfade on severity change — cancels any in-flight fade to avoid race conditions
  useEffect(() => {
    if (reducedMotion || !glowRef.current) return
    if (prevSeverityRef.current === severity) return
    prevSeverityRef.current = severity
    const el = glowRef.current
    fadeOutRef.current?.pause()
    fadeInRef.current?.pause()
    fadeOutRef.current = animate(el, { opacity: [1, 0], duration: 200 })
    fadeOutRef.current.then(() => {
      const { severity: s, severityColor: c } = latestGlowState.current
      el.style.background = `radial-gradient(circle, ${c}55 0%, transparent 70%)`
      el.style.animation = `glow-pulse-sev${s} ${GLOW_DURATION[s]} ease-in-out infinite`
      fadeInRef.current = animate(el, { opacity: [0, 1], duration: 200 })
    })
    return () => {
      fadeOutRef.current?.pause()
      fadeInRef.current?.pause()
    }
  }, [severity, severityColor, reducedMotion])

  return (
    <div style={{ position: 'relative', width: '50vmin', height: '50vmin' }}>
      {/* Glow layer — crossfade handled by animejs effect */}
      <div
        ref={glowRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '-20%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${severityColor}55 0%, transparent 70%)`,
          animation: reducedMotion
            ? 'none'
            : `glow-pulse-sev${severity} ${GLOW_DURATION[severity]} ease-in-out infinite`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <svg
        ref={svgRef}
        viewBox="0 0 400 400"
        width="100%"
        height="100%"
        style={{
          position: 'relative',
          zIndex: 1,
          transformOrigin: 'center center',
          overflow: 'visible',
        }}
        aria-label={`F1 tire, degradation severity ${severity} of 3`}
      >
        <TireRings severityColor={compoundColor} />
        <TireTread severity={severity} />
        <TireParticles severity={severity} severityColor={severityColor} />
        <text
          ref={counterRef}
          x="200"
          y="200"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="72"
          fontFamily="Rajdhani, system-ui"
          fontWeight="900"
          fill={severityColor}
          aria-live="polite"
          aria-label={`Severity ${severity}`}
        >
          {severity}
        </text>
      </svg>
    </div>
  )
}
