// lib/trackPath.ts
import * as THREE from 'three'

export const SILVERSTONE_WAYPOINTS: [number, number, number][] = [
  [0, 0, -4.5],    // Start/Finish straight
  [2.5, 0, -4.0],  // Copse approach
  [3.5, 0, -2.5],  // Copse
  [3.8, 0, -1.0],  // Maggotts
  [2.5, 0, 0.2],   // Becketts
  [1.5, 0, 1.5],   // Chapel
  [0.5, 0, 3.5],   // Hangar straight
  [-1.5, 0, 4.0],  // Stowe
  [-3.5, 0, 3.0],  // Vale
  [-4.5, 0, 1.0],  // Club
  [-4.0, 0, -1.5], // Abbey
  [-2.5, 0, -3.5], // Bridge
  [-1.0, 0, -4.5], // Priory
  [0, 0, -4.5],    // Close loop
]

export const SILVERSTONE_CURVE = new THREE.CatmullRomCurve3(
  SILVERSTONE_WAYPOINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  true,
)

export const TRACK_CENTER = new THREE.Vector3(0, 0, 0)

export const CORNER_POSITIONS: Record<string, THREE.Vector3> = {
  MB:    new THREE.Vector3(-1.2, 0, 0.8),
  Copse: new THREE.Vector3(2.1, 0, -1.4),
  Club:  new THREE.Vector3(-0.3, 0, 2.8),
  Stowe: new THREE.Vector3(-2.0, 0, 1.2),
}

export type CameraState = 'overview' | 'follow-driver' | 'corner-focus' | 'birds-eye' | 'split'
export type CameraTarget = { state: CameraState; corner?: string }
export type CameraFrame = { position: THREE.Vector3; lookAt: THREE.Vector3 }

function averagePositions(positions: THREE.Vector3[]): THREE.Vector3 {
  if (positions.length === 0) return TRACK_CENTER.clone()
  const sum = positions.reduce((acc, p) => acc.clone().add(p), new THREE.Vector3(0, 0, 0))
  return sum.divideScalar(positions.length)
}

export function getCameraPosition(
  target: CameraTarget,
  carPositions: Map<string, THREE.Vector3>,
  activeDriver: string
): CameraFrame {
  switch (target.state) {
    case 'follow-driver': {
      const pos = carPositions.get(activeDriver) ?? TRACK_CENTER
      return { position: pos.clone().add(new THREE.Vector3(0, 1.5, 2)), lookAt: pos.clone() }
    }
    case 'corner-focus': {
      const apex = CORNER_POSITIONS[target.corner ?? 'MB'] ?? TRACK_CENTER
      return { position: apex.clone().add(new THREE.Vector3(0, 2, 3)), lookAt: apex.clone() }
    }
    case 'birds-eye':
      return { position: new THREE.Vector3(0, 14, 0), lookAt: TRACK_CENTER.clone() }
    case 'split': {
      const mid = averagePositions([...carPositions.values()])
      return { position: mid.clone().add(new THREE.Vector3(0, 10, 4)), lookAt: mid.clone() }
    }
    default:
      return { position: new THREE.Vector3(0, 6, 8), lookAt: TRACK_CENTER.clone() }
  }
}
