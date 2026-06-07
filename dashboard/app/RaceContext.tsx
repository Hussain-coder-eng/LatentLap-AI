// app/RaceContext.tsx
'use client'
import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react'
import { getLapRange, getActualPitLap, getActualStint2Compound, type CompoundKey } from '../lib/data'

export interface RaceContextValue {
  currentLap: number
  currentYear: number
  currentDriver: string
  activePanelId: string | null
  topSHAPFeature: string | null
  trackStyle: 'A' | 'B' | 'C' | 'D'
  isTechnicalMode: boolean
  simCompound: CompoundKey
  simPitLap: number
  simDrawerOpen: boolean
  setCurrentLap: (n: number) => void
  setCurrentYear: (y: number) => void
  setCurrentDriver: (d: string) => void
  setActivePanelId: (id: string | null) => void
  setTopSHAPFeature: (f: string | null) => void
  setTrackStyle: (s: 'A' | 'B' | 'C' | 'D') => void
  setIsTechnicalMode: (v: boolean) => void
  setSimCompound: (c: CompoundKey) => void
  setSimPitLap: (l: number) => void
  setSimDrawerOpen: (v: boolean) => void
}

const RaceContext = createContext<RaceContextValue | null>(null)

const DEFAULT_YEAR   = 2025
const DEFAULT_DRIVER = 'NOR'

export function RaceProvider({ children }: { children: ReactNode }) {
  const [currentLap, setCurrentLap]           = useState(() => getLapRange(DEFAULT_YEAR, DEFAULT_DRIVER)[0])
  const [currentYear, setCurrentYear]         = useState(DEFAULT_YEAR)
  const [currentDriver, setCurrentDriver]     = useState(DEFAULT_DRIVER)
  const [activePanelId, setActivePanelId]     = useState<string | null>(null)
  const [topSHAPFeature, setTopSHAPFeature]   = useState<string | null>(null)
  const [trackStyle, setTrackStyle]           = useState<'A' | 'B' | 'C' | 'D'>('A')
  const [isTechnicalMode, setIsTechnicalMode] = useState(false)
  const [simCompound, setSimCompound]         = useState<CompoundKey>(() => getActualStint2Compound(DEFAULT_YEAR, DEFAULT_DRIVER))
  const [simPitLap, setSimPitLap]             = useState(() => getActualPitLap(DEFAULT_YEAR, DEFAULT_DRIVER))
  const [simDrawerOpen, setSimDrawerOpen]     = useState(false)

  useEffect(() => {
    setSimPitLap(getActualPitLap(currentYear, currentDriver))
    setSimCompound(getActualStint2Compound(currentYear, currentDriver))
  }, [currentYear, currentDriver])

  const value = useMemo<RaceContextValue>(() => ({
    currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature,
    trackStyle, isTechnicalMode, simCompound, simPitLap, simDrawerOpen,
    setCurrentLap, setCurrentYear, setCurrentDriver, setActivePanelId,
    setTopSHAPFeature, setTrackStyle, setIsTechnicalMode,
    setSimCompound, setSimPitLap, setSimDrawerOpen,
  }), [
    currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature,
    trackStyle, isTechnicalMode, simCompound, simPitLap, simDrawerOpen,
  ])

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceContextValue {
  const ctx = useContext(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used inside <RaceProvider>')
  return ctx
}
