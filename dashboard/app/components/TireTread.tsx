'use client'
import { useEffect, useRef } from 'react'
import { animate, morphTo } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

// All paths: M + 11L + Z (13 commands) — required for morphTo interpolation
// sev 0 = fresh (deep grooves), sev 3 = slick (flat)
const TREAD_PATHS: Record<number, string> = {
  0: 'M 140 230 L 140 170 L 173 170 L 173 182 L 187 182 L 187 170 L 213 170 L 213 182 L 227 182 L 227 170 L 260 170 L 260 230 Z',
  1: 'M 140 222 L 140 178 L 173 178 L 173 188 L 187 188 L 187 178 L 213 178 L 213 188 L 227 188 L 227 178 L 260 178 L 260 222 Z',
  2: 'M 140 214 L 140 186 L 173 186 L 173 194 L 187 194 L 187 186 L 213 186 L 213 194 L 227 194 L 227 186 L 260 186 L 260 214 Z',
  3: 'M 140 205 L 140 195 L 173 195 L 173 198 L 187 198 L 187 195 L 213 195 L 213 198 L 227 198 L 227 195 L 260 195 L 260 205 Z',
}

interface TireTreadProps {
  severity: number
}

export function TireTread({ severity }: TireTreadProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const reducedMotion = useReducedMotion()
  const clampedSev = Math.max(0, Math.min(3, Math.round(severity)))

  useEffect(() => {
    if (!pathRef.current) return
    const targetPath = TREAD_PATHS[clampedSev]
    if (reducedMotion) {
      pathRef.current.setAttribute('d', targetPath)
    } else {
      // morphTo expects a CSS selector pointing to a DOM element — pass the
      // hidden reference path ID, not the path string directly.
      animate(pathRef.current, {
        d: morphTo(`#tread-ref-${clampedSev}`),
        duration: 800,
        ease: 'inOutCubic',
      })
    }
  }, [clampedSev, reducedMotion])

  return (
    <g>
      {/* Hidden reference paths — morphTo reads their `d` attribute via CSS selector */}
      <defs>
        {([0, 1, 2, 3] as const).map(k => (
          <path key={k} id={`tread-ref-${k}`} d={TREAD_PATHS[k]} />
        ))}
      </defs>
      <path
        ref={pathRef}
        d={TREAD_PATHS[clampedSev]}
        fill="#1a1a1a"
        stroke="#666666"
        strokeWidth={1.5}
        opacity={0.8}
      />
    </g>
  )
}
