// app/RaceContext.tsx
'use client'
import { createContext, useContext, useState, useMemo, ReactNode } from 'react'
import { getLapRange } from '../lib/data'

export interface RaceContextValue {
  currentLap: number
  currentYear: number
  currentDriver: string
  activePanelId: string | null
  topSHAPFeature: string | null
  trackStyle: 'A' | 'B' | 'C' | 'D'
  isTechnicalMode: boolean
  setCurrentLap: (n: number) => void
  setCurrentYear: (y: number) => void
  setCurrentDriver: (d: string) => void
  setActivePanelId: (id: string | null) => void
  setTopSHAPFeature: (f: string | null) => void
  setTrackStyle: (s: 'A' | 'B' | 'C' | 'D') => void
  setIsTechnicalMode: (v: boolean) => void
}

const RaceContext = createContext<RaceContextValue | null>(null)

export function RaceProvider({ children }: { children: ReactNode }) {
  const [currentLap, setCurrentLap] = useState(() => getLapRange(2022, 'NOR')[0])
  const [currentYear, setCurrentYear] = useState(2022)
  const [currentDriver, setCurrentDriver] = useState('NOR')
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [topSHAPFeature, setTopSHAPFeature] = useState<string | null>(null)
  const [trackStyle, setTrackStyle] = useState<'A' | 'B' | 'C' | 'D'>('A')
  const [isTechnicalMode, setIsTechnicalMode] = useState(false)

  const value = useMemo<RaceContextValue>(() => ({
    currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature, trackStyle, isTechnicalMode,
    setCurrentLap, setCurrentYear, setCurrentDriver, setActivePanelId, setTopSHAPFeature, setTrackStyle, setIsTechnicalMode,
  }), [currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature, trackStyle, isTechnicalMode])

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceContextValue {
  const ctx = useContext(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used inside <RaceProvider>')
  return ctx
}
