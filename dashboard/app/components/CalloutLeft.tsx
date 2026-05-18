'use client'
import { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import { useReducedMotion } from '../../lib/useReducedMotion'

export interface CalloutLeftContent {
  label: string
  value: string
  valueColor?: string
  explanation: string
}

interface CalloutLeftProps {
  content: CalloutLeftContent
  visible: boolean
}

export function CalloutLeft({ content, visible }: CalloutLeftProps) {
  const linesRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const el = linesRef.current
    if (!el || reducedMotion) return

    const children = Array.from(el.children) as HTMLElement[]
    if (visible) {
      animate(children, {
        translateX: [-40, 0],
        opacity: [0, 1],
        delay: stagger(40),
        duration: 360,
        ease: 'outQuart',
      })
    } else {
      animate(children, {
        translateX: [0, 40],
        opacity: [1, 0],
        duration: 240,
        ease: 'outQuart',
      })
    }
  }, [visible, reducedMotion])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 180,
        maxWidth: 240,
        opacity: visible ? undefined : 0,
      }}
    >
      <div ref={linesRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: 11,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {content.label}
        </div>
        <div
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: 36,
            lineHeight: 1,
            color: content.valueColor ?? '#ffffff',
          }}
        >
          {content.value}
        </div>
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: '#aaaaaa',
            lineHeight: 1.5,
          }}
        >
          {content.explanation}
        </div>
      </div>
    </div>
  )
}
