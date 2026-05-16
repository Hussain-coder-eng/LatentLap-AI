// app/page.tsx
'use client'
import dynamic from 'next/dynamic'
import React, { Suspense } from 'react'
import { RaceProvider } from './RaceContext'
import Header from './components/Header'
import LapScrubber from './components/LapScrubber'
import TireHealth from './components/TireHealth'
import ShapPanel from './components/ShapPanel'
import Timeline from './components/Timeline'
import StrategyAdvisor from './components/StrategyAdvisor'
import SeverityBadgeCard from './components/SeverityBadgeCard'

class Track3DErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Track3D] WebGL render error:', error, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--surface)]">
          <span className="font-['Rajdhani'] text-xs text-[var(--text-muted)] tracking-widest">
            WebGL unavailable
          </span>
        </div>
      )
    }
    return this.props.children
  }
}

const Track3D = dynamic(() => import('./components/Track3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--surface)]">
      <span className="font-['Rajdhani'] text-xs text-[var(--text-muted)] tracking-widest animate-pulse">
        LOADING CIRCUIT...
      </span>
    </div>
  ),
})

export default function DashboardPage() {
  return (
    <RaceProvider>
      {/* pb-[72px] on mobile reserves space for sticky LapScrubber */}
      <div className="min-h-[100dvh] bg-[var(--bg)] flex flex-col pb-[72px] md:pb-0">
        <Header />

        <div className="flex flex-1 flex-col md:flex-row gap-2 md:gap-3 p-2 md:p-3 xl:max-w-[1600px] xl:mx-auto xl:w-full">
          {/* LEFT col: Track3D + scrubber */}
          <div className="flex flex-col gap-2 w-full md:w-[55%] lg:w-[60%]">
            {/* Mobile: severity badge instead of WebGL */}
            <div className="sm:hidden">
              <SeverityBadgeCard />
            </div>
            {/* sm+: full 3D track */}
            <div className="hidden sm:block sm:min-h-[40vh] md:flex-1 md:h-[50vh] rounded-lg overflow-hidden border border-[var(--border)]">
              <Track3DErrorBoundary>
                <Suspense><Track3D /></Suspense>
              </Track3DErrorBoundary>
            </div>
          </div>

          {/* RIGHT col: TireHealth + ShapPanel */}
          <div className="flex flex-col gap-2 md:gap-3 w-full md:w-[45%] lg:w-[40%]">
            <TireHealth />
            <ShapPanel />
          </div>
        </div>

        <div className="px-2 pb-2 md:px-3 md:pb-3"><Timeline /></div>
        <div className="px-2 pb-4 md:px-3 md:pb-6"><StrategyAdvisor /></div>

        {/* LapScrubber: sticky bottom on mobile, static on md+ */}
        <div className="fixed bottom-0 left-0 right-0 md:static md:bottom-auto
          bg-[var(--bg)]/95 backdrop-blur-md border-t border-[var(--border)]
          pb-[env(safe-area-inset-bottom,0px)]
          md:border-t-0 md:bg-transparent md:backdrop-blur-none
          md:px-3 md:pb-3 z-40">
          <LapScrubber />
        </div>
      </div>
    </RaceProvider>
  )
}
