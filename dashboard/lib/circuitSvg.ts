export interface Point2D { x: number; y: number }

// Silverstone waypoints projected from 3D [x, _, z] → 2D SVG [x, y]
// viewBox "0 0 200 200". Scale factor 22, offset +4.5 on both axes.
export const CIRCUIT_POINTS: Point2D[] = [
  { x: 99,  y: 0   }, // Start/Finish
  { x: 154, y: 11  }, // Copse approach
  { x: 176, y: 44  }, // Copse
  { x: 183, y: 77  }, // Maggotts
  { x: 154, y: 103 }, // Becketts
  { x: 132, y: 132 }, // Chapel
  { x: 110, y: 176 }, // Hangar straight
  { x: 66,  y: 187 }, // Stowe
  { x: 22,  y: 165 }, // Vale
  { x: 0,   y: 121 }, // Club
  { x: 11,  y: 66  }, // Abbey
  { x: 44,  y: 22  }, // Bridge
  { x: 77,  y: 0   }, // Priory
  { x: 99,  y: 0   }, // Close loop (back to S/F)
]

// Smooth SVG path string from waypoints using cubic bezier approximation
export function buildCircuitPath(): string {
  const pts = CIRCUIT_POINTS
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4
    const cpy1 = prev.y + (curr.y - prev.y) * 0.1
    const cpx2 = prev.x + (curr.x - prev.x) * 0.6
    const cpy2 = prev.y + (curr.y - prev.y) * 0.9
    d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`
  }
  return d
}

// Named corner positions in SVG space (for ch3 glow zones)
export const CORNER_SVG: Record<string, Point2D> = {
  MB:    { x: 154, y: 103 }, // Maggotts-Becketts
  Copse: { x: 176, y: 44  }, // Copse
  Stowe: { x: 66,  y: 187 }, // Stowe
  Club:  { x: 0,   y: 121 }, // Club
}

// Maps a lap number to a progress ratio (0–1) along the circuit path
export function lapToCircuitProgress(lap: number, maxLap: number): number {
  if (maxLap <= 1) return 0
  return Math.min(1, Math.max(0, (lap - 1) / (maxLap - 1)))
}
