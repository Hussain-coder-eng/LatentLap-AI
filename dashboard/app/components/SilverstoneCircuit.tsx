'use client'
import { useEffect, useRef } from 'react'
import { animate, createDrawable } from 'animejs'
import { buildCircuitPath, CORNER_SVG } from '../../lib/circuitSvg'
import { getSHAP, getCornerBreakdowns, normalizeCornerScores, type CornerBreakdown, type DegType } from '../../lib/data'
import { useRaceContext } from '../RaceContext'
import { useReducedMotion } from '../../lib/useReducedMotion'

interface SilverstoneCircuitProps {
  activeChapter: number
  backgroundOnly?: boolean
}

// Build path once at module level — stable across renders
const CIRCUIT_PATH_D = buildCircuitPath()

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  if (Math.abs(endAngle - startAngle) < 0.5) return ''
  const s = polarToCartesian(cx, cy, r, startAngle)
  const e = polarToCartesian(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? '1' : '0'
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

const DEG_COLORS: Record<DegType, string> = {
  blister: '#FF1744',
  thermal: '#FF8000',
  wear:    '#FFD600',
  other:   '#888888',
}

const CORNER_LABELS: Record<string, string> = {
  MB:    'MB',
  Copse: 'COPSE',
  Stowe: 'STOWE',
  Club:  'CLUB',
}

export function SilverstoneCircuit({ activeChapter, backgroundOnly }: SilverstoneCircuitProps) {
  const circuitRef = useRef<SVGPathElement>(null)
  const carRef = useRef<SVGGElement>(null)
  const reducedMotion = useReducedMotion()
  const { currentLap, currentYear, currentDriver } = useRaceContext()

  const shapEntry  = getSHAP(currentYear, currentDriver, currentLap)
  const breakdowns = shapEntry ? getCornerBreakdowns(shapEntry) : null
  const scores     = breakdowns ? normalizeCornerScores(breakdowns) : null

  // Draw circuit in on mount; skip if reduced motion
  useEffect(() => {
    if (reducedMotion || !circuitRef.current) return
    animate(createDrawable(circuitRef.current), {
      draw: ['0 0', '0 1'],
      duration: 2000,
      ease: 'outCubic',
    })
  }, [reducedMotion])

  // Continuous GSAP loop — car drives full circuit in 8s, repeat forever
  useEffect(() => {
    if (reducedMotion) return
    const pathEl = circuitRef.current
    const carEl  = carRef.current
    if (!pathEl || !carEl) return

    let cancelled = false
    let tween: { kill: () => void } | null = null

    import('gsap').then(({ default: gsap }) => {
      if (cancelled) return
      const proxy = { t: 0 }
      const totalLength = pathEl.getTotalLength()
      tween = gsap.to(proxy, {
        t: 1,
        duration: 8,
        ease: 'none',
        repeat: -1,
        onUpdate() {
          const dist  = proxy.t * totalLength
          const point = pathEl.getPointAtLength(dist)
          const half  = Math.min(1, totalLength * 0.005)
          const p1    = pathEl.getPointAtLength(Math.max(0, dist - half))
          const p2    = pathEl.getPointAtLength(Math.min(totalLength, dist + half))
          const dx    = p2.x - p1.x
          const dy    = p2.y - p1.y
          const angleDeg = Math.atan2(dx, -dy) * (180 / Math.PI)
          carEl.setAttribute(
            'transform',
            `translate(${point.x.toFixed(2)}, ${point.y.toFixed(2)}) rotate(${angleDeg.toFixed(1)}) translate(-6, -11)`
          )
        },
      })
    })

    return () => {
      cancelled = true
      tween?.kill()
    }
  }, [reducedMotion])

  const showCornerGlow = activeChapter === 2

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <defs>
        <filter id="silverstoneTrackGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={1.4} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Silverstone circuit trace */}
      <path
        ref={circuitRef}
        d={CIRCUIT_PATH_D}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.32}
        filter="url(#silverstoneTrackGlow)"
      />

      {/* Corner glow circles — Chapter 2 (Predictors) only */}
      {showCornerGlow && breakdowns && scores && (
        <g data-testid="corner-glow-group">
          <defs>
            <style>{`
              @keyframes cornerPulse {
                0%, 100% { transform: scale(1);    opacity: 0.95; }
                50%       { transform: scale(1.18); opacity: 0.6;  }
              }
              .corner-pulse {
                animation: cornerPulse 0.9s ease-in-out infinite;
                transform-box: fill-box;
                transform-origin: center;
              }
            `}</style>
          </defs>
          {Object.entries(CORNER_SVG).map(([name, pos]) => {
            const score = scores[name] ?? 0
            const bd    = breakdowns[name]
            if (!bd) return null

            const r       = 8 + score * 6
            const opacity = backgroundOnly ? Math.min(0.04 + score * 0.11, 0.15) : 0.35 + score * 0.6
            const color   = score > 0.6 ? '#FF1744' : '#FF8000'
            const isPrimary = score === Math.max(...Object.values(scores))

            const arcR = r + 3
            const total = bd.blister + bd.thermal + bd.wear + bd.other
            const arcs: Array<{ type: DegType; startAngle: number; endAngle: number }> = []
            let angle = 0
            for (const type of ['blister', 'thermal', 'wear', 'other'] as DegType[]) {
              const share = total > 0 ? (bd[type] / total) * 360 : 0
              if (share > 1) {
                arcs.push({ type, startAngle: angle, endAngle: Math.min(angle + share, angle + 359.9) })
              }
              angle += share
            }

            const labelY = pos.y - r - 6

            return (
              <g key={name}>
                <circle
                  cx={pos.x} cy={pos.y} r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={opacity}
                  className={!backgroundOnly && score > 0.7 ? 'corner-pulse' : undefined}
                />
                {arcs.map(arc => (
                  <path
                    key={arc.type}
                    d={describeArc(pos.x, pos.y, arcR, arc.startAngle, arc.endAngle)}
                    fill="none"
                    stroke={DEG_COLORS[arc.type]}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                ))}
                <text
                  x={pos.x} y={labelY}
                  textAnchor="middle"
                  fontSize={isPrimary ? 5.5 : 4.5}
                  fill={isPrimary ? '#ffffff' : '#aaaaaa'}
                  fontFamily="monospace"
                  opacity={isPrimary ? 0.9 : 0.55}
                >
                  {isPrimary
                    ? `${CORNER_LABELS[name]} · ${bd.dominant.toUpperCase()}`
                    : CORNER_LABELS[name]
                  }
                </text>
              </g>
            )
          })}
        </g>
      )}

      {/* Car marker — compact top-down F1 silhouette, positioned via transform */}
      <g ref={carRef} data-testid="circuit-car-marker">
        <rect x={2.2} y={0.2} width={7.6} height={1.9} rx={0.35} fill="#1a1f24" />
        <rect x={1.1} y={18.6} width={9.8} height={2.4} rx={0.45} fill="#1a1f24" />
        <rect x={0.5} y={4.1} width={2.1} height={4.7} rx={0.8} fill="#111418" />
        <rect x={9.4} y={4.1} width={2.1} height={4.7} rx={0.8} fill="#111418" />
        <rect x={0.4} y={13.2} width={2.2} height={5.1} rx={0.85} fill="#111418" />
        <rect x={9.4} y={13.2} width={2.2} height={5.1} rx={0.85} fill="#111418" />
        <path
          d="M6 1.4 L8.1 4.6 L8.6 14.8 L6 20.8 L3.4 14.8 L3.9 4.6 Z"
          fill="#FF8000"
        />
        <path d="M4.3 5.1 L7.7 5.1 L7.2 13.1 L4.8 13.1 Z" fill="#ff9f2e" opacity={0.85} />
        <ellipse cx={6} cy={9.6} rx={1.25} ry={1.9} fill="#15191e" />
        <path d="M4.1 14.4 L7.9 14.4 L6.9 18.2 L5.1 18.2 Z" fill="#e86f00" />
        <path d="M4.6 3.3 L7.4 3.3" stroke="#ffd6a3" strokeWidth={0.55} strokeLinecap="round" />
        <path d="M5.1 15.4 L5.9 15.4 M6.5 16.3 L7.3 16.3" stroke="#1a1f24" strokeWidth={0.38} strokeLinecap="round" />
      </g>
    </svg>
  )
}
