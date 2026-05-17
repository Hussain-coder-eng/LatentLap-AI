'use client'
import { RaceProvider } from './RaceContext'
import ScrollStage from './components/ScrollStage'
import { Speedometer } from './components/Speedometer'
import LapScrubberFixed from './components/LapScrubberFixed'
import SettingsPopover from './components/SettingsPopover'

export default function DashboardPage() {
  return (
    <RaceProvider>
      <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
        <Speedometer />
        <SettingsPopover />
        <ScrollStage />
        <LapScrubberFixed />
      </div>
    </RaceProvider>
  )
}
