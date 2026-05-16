// lib/severityColors.ts
export const SEVERITY_LABELS = ['Healthy', 'Mild Degradation', 'Moderate Degradation', 'Critical — Blistering*'] as const
export const SEVERITY_CSS_VARS = ['--sev-0', '--sev-1', '--sev-2', '--sev-3'] as const

const SEVERITY_HEX: Record<number, string> = {
  0: '#00E676', 1: '#FFD600', 2: '#FF6D00', 3: '#FF1744',
}

export function getSeverityCSSVar(severity: number): string {
  return SEVERITY_CSS_VARS[Math.min(Math.max(severity, 0), 3)]
}
export function getSeverityHex(severity: number): string {
  return SEVERITY_HEX[Math.min(Math.max(severity, 0), 3)]
}
export function getSeverityLabel(severity: number): string {
  return SEVERITY_LABELS[Math.min(Math.max(severity, 0), 3)]
}
