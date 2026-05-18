'use client'
import { useEffect, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { useRaceContext } from '../RaceContext'
import { useReducedMotion } from '../../lib/useReducedMotion'

export interface ShapRow {
  label: string
  value: number
  barPct: number
}

export interface CalloutRightContent {
  heading: string
  rows?: ShapRow[]
  customLines?: string[]
  technicalDetail: string
}

interface CalloutRightProps {
  content: CalloutRightContent
  visible: boolean
}

export function CalloutRight({ content, visible }: CalloutRightProps) {
  const linesRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const { isTechnicalMode, setIsTechnicalMode } = useRaceContext()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = linesRef.current
    if (!el || reducedMotion) return

    const children = Array.from(el.children) as HTMLElement[]
    if (visible) {
      animate(children, {
        translateX: [40, 0],
        opacity: [0, 1],
        delay: stagger(40),
        duration: 360,
        ease: 'outQuart',
      })
    } else {
      animate(children, {
        translateX: [0, -40],
        opacity: [1, 0],
        duration: 240,
        ease: 'outQuart',
      })
    }
  }, [visible, reducedMotion])

  // Sync local expanded state with isTechnicalMode context
  useEffect(() => {
    setExpanded(isTechnicalMode)
  }, [isTechnicalMode])

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    setIsTechnicalMode(next)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 200,
        maxWidth: 280,
        opacity: visible ? undefined : 0,
      }}
    >
      <div ref={linesRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Heading */}
        <div
          style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: 11,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {content.heading}
        </div>

        {/* SHAP rows */}
        {content.rows?.map((row) => (
          <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: '#cccccc',
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: 11,
                  color: row.value >= 0 ? 'var(--shap-pos, #FF8000)' : 'var(--shap-neg, #2979FF)',
                }}
              >
                {row.value >= 0 ? '+' : ''}{row.value.toFixed(3)}
              </span>
            </div>
            <div style={{ height: 3, background: '#222', borderRadius: 2 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(row.barPct, 100)}%`,
                  background: row.value >= 0 ? 'var(--shap-pos, #FF8000)' : 'var(--shap-neg, #2979FF)',
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ))}

        {/* Custom text lines */}
        {content.customLines?.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: '#aaaaaa',
              lineHeight: 1.5,
            }}
          >
            {line}
          </div>
        ))}

        {/* Technical toggle */}
        <button
          onClick={handleToggle}
          aria-expanded={expanded}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '3px 8px',
            fontFamily: "'Fira Code', monospace",
            fontSize: 10,
            color: expanded ? '#FF8000' : '#888',
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          {expanded ? '- Technical' : '+ Technical'}
        </button>

        {/* Technical detail — shown when expanded */}
        {expanded && (
          <div
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: 10,
              color: '#888',
              lineHeight: 1.6,
              borderLeft: '2px solid #333',
              paddingLeft: 8,
              marginTop: 2,
            }}
          >
            {content.technicalDetail}
          </div>
        )}
      </div>
    </div>
  )
}
