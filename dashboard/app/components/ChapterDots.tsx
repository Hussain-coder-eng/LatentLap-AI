'use client'

const CHAPTER_NAMES = ['Hero', 'Severity', 'Predictors', 'Race Arc', 'Strategy'] as const

interface ChapterDotsProps {
  activeChapter: number
  onSelect: (ch: number) => void
}

export default function ChapterDots({ activeChapter, onSelect }: ChapterDotsProps) {
  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
      }}
    >
      {CHAPTER_NAMES.map((name, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          aria-label={`Chapter ${i + 1} of 5: ${name}`}
          style={{
            width: activeChapter === i ? 13 : 10,
            height: activeChapter === i ? 13 : 10,
            borderRadius: '50%',
            background: activeChapter === i ? '#FF8000' : '#555',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            transform: activeChapter === i ? 'scale(1.3)' : 'scale(1)',
            transition: 'background 0.2s, transform 0.2s',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}
