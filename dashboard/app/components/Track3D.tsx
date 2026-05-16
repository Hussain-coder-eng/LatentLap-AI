// app/components/Track3D.tsx
'use client'
import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useRaceContext } from '../RaceContext'
import { getAllLapsForDriver, getDriversForYear, LapData } from '../../lib/data'
import { getSeverityHex } from '../../lib/severityColors'
import { SILVERSTONE_CURVE, CORNER_POSITIONS, TRACK_CENTER, getCameraPosition } from '../../lib/trackPath'

const TRACK_STYLE_CONFIGS: Record<string, { color: string; emissive: string; emissiveIntensity: number }> = {
  A: { color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 0.8 },
  B: { color: '#FF8000', emissive: '#FF6000', emissiveIntensity: 0.6 },
  C: { color: '#00E5FF', emissive: '#00B8D9', emissiveIntensity: 0.5 },
  D: { color: '#FF1744', emissive: '#CC0033', emissiveIntensity: 0.5 },
}

const CORNER_LABELS: Record<string, string> = { MB: 'M-B', Copse: 'Copse', Club: 'Club', Stowe: 'Stowe' }

function Track({ style }: { style: string }) {
  const cfg = TRACK_STYLE_CONFIGS[style] ?? TRACK_STYLE_CONFIGS.A
  const tubeGeom = useMemo(() => new THREE.TubeGeometry(SILVERSTONE_CURVE, 200, 0.08, 8, true), [])
  return (
    <mesh geometry={tubeGeom}>
      <meshStandardMaterial color={cfg.color} emissive={cfg.emissive} emissiveIntensity={cfg.emissiveIntensity} />
    </mesh>
  )
}

function Car({ lapProgress, severityPred }: { lapProgress: number; severityPred: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const clampedProgress = Math.max(0, Math.min(lapProgress, 0.9999))
  const position = SILVERSTONE_CURVE.getPointAt(clampedProgress)
  const tangent = SILVERSTONE_CURVE.getTangentAt(clampedProgress)
  const { clock } = useThree()

  useFrame(() => {
    if (!meshRef.current) return
    meshRef.current.position.copy(position)
    meshRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent)
    if (lightRef.current && severityPred >= 3) {
      lightRef.current.intensity = Math.sin(clock.elapsedTime * 4) * 0.5 + 1.5
    }
  })

  const isCritical = severityPred >= 2

  return (
    <group>
      <mesh ref={meshRef}>
        <boxGeometry args={[0.2, 0.08, 0.35]} />
        <meshStandardMaterial
          color={getSeverityHex(severityPred)}
          emissive={isCritical ? '#FF1744' : '#000000'}
          emissiveIntensity={isCritical ? 0.5 : 0}
        />
      </mesh>
      {isCritical && (
        <pointLight ref={lightRef} position={[position.x, position.y + 0.2, position.z]}
          color="#FF1744" intensity={severityPred * 2} distance={2} />
      )}
    </group>
  )
}

function CameraController({ activePanelId, topSHAPFeature, carPositions, activeDriver }: {
  activePanelId: string | null; topSHAPFeature: string | null;
  carPositions: Map<string, THREE.Vector3>; activeDriver: string
}) {
  const { camera } = useThree()
  const orbitRef = useRef<any>(null)
  const cornerPrefix = topSHAPFeature?.split('_')[0]

  const cameraTarget = useMemo(() => {
    if (activePanelId === 'tire-health') return { state: 'follow-driver' as const }
    if (activePanelId === 'shap' && cornerPrefix && ['MB', 'Copse', 'Club', 'Stowe'].includes(cornerPrefix))
      return { state: 'corner-focus' as const, corner: cornerPrefix }
    if (activePanelId === 'timeline' || activePanelId === 'comparison') return { state: 'birds-eye' as const }
    return { state: 'overview' as const }
  }, [activePanelId, cornerPrefix])

  useFrame(() => {
    const frame = getCameraPosition(cameraTarget, carPositions, activeDriver)
    camera.position.lerp(frame.position, 0.04)
    if (orbitRef.current) { orbitRef.current.target.lerp(frame.lookAt, 0.04); orbitRef.current.update() }
  })

  return <OrbitControls ref={orbitRef} minPolarAngle={0} maxPolarAngle={Math.PI / 2} enableDamping />
}

function Scene() {
  const { currentLap, currentYear, currentDriver, activePanelId, topSHAPFeature, trackStyle } = useRaceContext()
  const drivers = getDriversForYear(currentYear)
  const carPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map())

  const driverData = useMemo(() => {
    const result: Record<string, { progress: number; severity: number }> = {}
    for (const driver of drivers) {
      const laps = getAllLapsForDriver(currentYear, driver)
      const lap = laps.find((l: LapData) => l.lap_number === currentLap)
      if (lap) result[driver] = { progress: lap.track_progress, severity: lap.severity_pred }
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentDriver, currentLap, drivers])

  useFrame(() => {
    const updated = new Map<string, THREE.Vector3>()
    for (const [driver, data] of Object.entries(driverData)) {
      updated.set(driver, SILVERSTONE_CURVE.getPointAt(Math.max(0, Math.min(data.progress, 0.9999))))
    }
    carPositionsRef.current = updated
  })

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 5, 0]} intensity={0.8} color="#FFFFFF" />
      <Track style={trackStyle} />
      <Stars radius={80} depth={50} count={200} factor={4} fade />

      {Object.entries(driverData).map(([driver, data]) => (
        <Car key={driver} lapProgress={data.progress} severityPred={data.severity} />
      ))}

      {Object.entries(CORNER_POSITIONS).map(([name, pos]) => (
        <Html key={name} position={[pos.x, pos.y + 0.3, pos.z]} center>
          <span className="font-['Fira_Code'] text-[10px] text-[var(--text-muted)] pointer-events-none">
            {CORNER_LABELS[name] ?? name}
          </span>
        </Html>
      ))}

      <CameraController activePanelId={activePanelId} topSHAPFeature={topSHAPFeature}
        carPositions={carPositionsRef.current} activeDriver={currentDriver} />
    </>
  )
}

export default function Track3D() {
  return (
    <div className="relative w-full h-full">
      <video src="/media/silverstone_flyover.mp4" autoPlay loop muted playsInline preload="none"
        className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" aria-hidden="true"
        onError={e => { (e.target as HTMLVideoElement).style.display = 'none' }} />
      <Canvas camera={{ position: [0, 6, 8], fov: 50 }} aria-label="Silverstone circuit 3D visualization" className="w-full h-full">
        <Scene />
      </Canvas>
    </div>
  )
}
