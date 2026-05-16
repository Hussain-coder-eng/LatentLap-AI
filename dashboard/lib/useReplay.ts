// lib/useReplay.ts
// Builds a single Anime.js v4 createTimeline once per [year, driver] combo.
// Anime.js v4: createTimeline — NOT anime.timeline()
'use client'
import { useRef, useEffect, useCallback } from 'react'
import { useReducedMotion } from './useReducedMotion'

export function useReplay(
  minLap: number,
  maxLap: number,
  onLapChange: (lap: number) => void
) {
  const reducedMotion = useReducedMotion()
  const tlRef = useRef<any>(null)
  const lapRef = useRef({ value: minLap })

  useEffect(() => {
    if (reducedMotion) return
    import('animejs').then(({ createTimeline }) => {
      const lapRange = Array.from({ length: maxLap - minLap + 1 }, (_, i) => minLap + i)
      const tl = createTimeline({ defaults: { ease: 'outQuart', duration: 400 }, autoplay: false })
      lapRange.forEach((lap, i) => { tl.add(lapRef.current, { value: lap }, i * 800) })
      tl.onUpdate = () => onLapChange(Math.round(lapRef.current.value))
      tlRef.current = tl
    })
    return () => { tlRef.current?.cancel() }
  }, [minLap, maxLap, reducedMotion, onLapChange])

  const play  = useCallback(() => tlRef.current?.play(), [])
  const pause = useCallback(() => tlRef.current?.pause(), [])
  const seek  = useCallback((lap: number) => tlRef.current?.seek((lap - minLap) * 800), [minLap])

  return { play, pause, seek }
}
