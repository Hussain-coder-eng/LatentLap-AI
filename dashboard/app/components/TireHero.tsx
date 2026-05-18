'use client'
import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
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

  useEffect(() => {
    if (!counterRef.current) return
    if (reducedMotion) {
      counterRef.current.textContent = String(severity)
      counterObj.current.v = severity
      return
    }
    const anim = animate(counterObj.current as unknown as Parameters<typeof animate>[0], {
      v: severity,
      ease: 'outExpo',
      duration: 600,
      onUpdate: () => {
        if (counterRef.current) {
          counterRef.current.textContent = String(Math.round(counterObj.current.v))
        }
      },
    })
    return () => { anim.pause() }
  }, [severity, reducedMotion])

  const rotateDeg = reducedMotion ? 0 : scrollProgress * 720

  return (
    <div style={{ position: 'relative', width: '50vmin', height: '50vmin' }}>
      {/* Glow layer — keyed to severity so CSS animation restarts on change */}
      <div
        key={severity}
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
        viewBox="0 0 400 400"
        width="100%"
        height="100%"
        style={{
          position: 'relative',
          zIndex: 1,
          transform: `rotate(${rotateDeg}deg)`,
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
