'use client'

import { useNarrowViewport } from '../../lib/useNarrowViewport'

const CHAPTER_NAMES = ['Hero', 'Severity', 'Predictors', 'Race Arc', 'Strategy', 'Compare'] as const
const CHAPTER_NAMES_SHORT = ['Hero', 'Sev', 'Pred', 'Arc', 'Strat', 'Cmp'] as const

interface ChapterDotsProps {
  activeChapter: number
  onSelect: (ch: number) => void
}

export default function ChapterDots({ activeChapter, onSelect }: ChapterDotsProps) {
  const isMobile = useNarrowViewport()

  // Mobile: horizontal rail above the scrubber, outside the top control zone.
  if (isMobile) {
    return (
      <div
        className="chapter-dots chapter-dots--mobile"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          zIndex: 300,
          display: 'flex',
          flexDirection: 'row',
          background: 'rgba(8,8,8,0.92)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid #222',
          pointerEvents: 'auto',
        }}
        aria-label="Chapter navigation"
        role="tablist"
      >
        {CHAPTER_NAMES.map((name, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={activeChapter === i}
            aria-label={`Chapter ${i + 1}: ${name}`}
            onClick={() => onSelect(i)}
            style={{
              flex: 1,
              padding: '8px 2px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeChapter === i ? '2px solid #FF8000' : '2px solid transparent',
              color: activeChapter === i ? '#FF8000' : '#888',
              fontFamily: "'Fira Code', monospace",
              fontSize: 10,
              fontWeight: activeChapter === i ? 700 : 400,
              cursor: 'pointer',
              transition: 'color 0.2s, border-color 0.2s',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}
          >
            {CHAPTER_NAMES_SHORT[i]}
          </button>
        ))}
      </div>
    )
  }

  // Desktop: horizontal dot rail above scrubber (scrubber is 48px, rail sits at bottom: 56px)
  return (
    <div
      className="chapter-dots chapter-dots--desktop"
      style={{
        position: 'fixed',
        bottom: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'row',
        gap: 16,
        alignItems: 'center',
        background: 'rgba(8,8,8,0.72)',
        backdropFilter: 'blur(8px)',
        borderRadius: 24,
        padding: '8px 20px',
        border: '1px solid rgba(255,255,255,0.06)',
        pointerEvents: 'auto',
      }}
      aria-label="Chapter navigation"
      role="tablist"
    >
      {CHAPTER_NAMES.map((name, i) => (
        <button
          key={i}
          role="tab"
          title={name}
          onClick={() => onSelect(i)}
          aria-label={`Chapter ${i + 1} of 6: ${name}`}
          aria-selected={activeChapter === i}
          aria-current={activeChapter === i ? 'true' : undefined}
          style={{
            width: activeChapter === i ? 13 : 10,
            height: activeChapter === i ? 13 : 10,
            borderRadius: '50%',
            background: activeChapter === i ? '#FF8000' : '#555',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            transform: activeChapter === i ? 'scale(1.3)' : 'scale(1)',
            transition: 'background 0.2s, transform 0.2s, width 0.2s, height 0.2s',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}
