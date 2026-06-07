// lib/useNarrowViewport.ts
'use client'
import { useEffect, useState } from 'react'

export const NARROW_VIEWPORT_QUERY = '(max-width: 640px)'

export function useNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(NARROW_VIEWPORT_QUERY)
    setIsNarrow(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isNarrow
}
