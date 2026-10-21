import type { ImpactLevel, UrgencyLevel } from '../utils/priorityEngine';

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  critical: 'Urgencia Crítica',
  high: 'Urgencia Alta',
  medium: 'Urgencia Media',
  low: 'Urgencia Baja',
};

export const IMPACT_LABELS: Record<ImpactLevel, string> = {
  high: 'Impacto Alto',
  medium: 'Impacto Medio',
  low: 'Impacto Bajo',
};

export const BREAKDOWN_META = [
  { key: 'importance', label: 'Importancia', hint: 'Peso del área × impacto', color: '#0F172A', max: 40 },
  { key: 'urgency', label: 'Urgencia', hint: 'Cercanía de la fecha límite', color: '#DC2626', max: 35 },
  { key: 'age', label: 'Antigüedad', hint: 'Tiempo que lleva esperando', color: '#D97706', max: 15 },
  { key: 'effort', label: 'Rapidez', hint: 'Tareas cortas suman más', color: '#059669', max: 10 },
] as const;

/** Score color scale: red for "do it now", amber for soon, slate for later. */
export function scoreColor(score: number): string {
  if (score >= 75) return '#DC2626';
  if (score >= 60) return '#EA580C';
  if (score >= 45) return '#D97706';
  return '#64748B';
}
