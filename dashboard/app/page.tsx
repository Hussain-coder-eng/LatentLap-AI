'use client'
import { RaceProvider, useRaceContext } from './RaceContext'
import ScrollStage from './components/ScrollStage'
import { Speedometer } from './components/Speedometer'
import LapScrubberFixed from './components/LapScrubberFixed'
import SettingsPopover from './components/SettingsPopover'
import SimDrawer from './components/SimDrawer'

function SimFAB() {
  const { simDrawerOpen, setSimDrawerOpen } = useRaceContext()
  return (
    <button
      data-testid="sim-fab"
      aria-label="Open strategy simulator"
      onClick={() => setSimDrawerOpen(!simDrawerOpen)}
      style={{
        position: 'fixed',
        bottom: 88,
        right: 16,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: simDrawerOpen ? '#FF8000' : '#1a1f24',
        border: '1px solid rgba(255,128,0,0.6)',
        color: simDrawerOpen ? '#000' : '#FF8000',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 700,
        cursor: 'pointer',
        zIndex: 150,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        letterSpacing: 0.5,
      }}
    >
      SIM
    </button>
  )
}

export default function DashboardPage() {
  return (
    <RaceProvider>
      <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
        <Speedometer />
        <SettingsPopover />
        <ScrollStage />
        <LapScrubberFixed />
        <SimFAB />
        <SimDrawer />
      </div>
    </RaceProvider>
  )
}
