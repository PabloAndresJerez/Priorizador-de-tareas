import { daysUntilDue } from './dates';
import { type EnrichedTask, type PriorityPillar, getTaskAgeDays } from './priorityEngine';

export interface DailyPlan {
  planned: EnrichedTask[];
  totalMinutes: number;
  budgetMinutes: number;
  /** Tasks due today or overdue that did not fit in the budget. */
  mustDoOverflow: EnrichedTask[];
}

/**
 * Builds today's plan: overdue, due-today and critical tasks are guaranteed a slot, then the highest scoring
 * tasks that still fit in the time available. A task that does not fit is skipped so a
 * smaller one further down can fill the gap.
 */
export function buildDailyPlan(
  sortedTasks: EnrichedTask[],
  budgetMinutes: number,
  nowMs = Date.now()
): DailyPlan {
  const active = sortedTasks.filter((t) => t.status === 'needsAction');
  const isMustDo = (t: EnrichedTask) => {
    const days = daysUntilDue(t.due, nowMs);
    return (days !== undefined && days <= 0) || t.urgency === 'critical';
  };

  const planned: EnrichedTask[] = [];
  const mustDoOverflow: EnrichedTask[] = [];
  let used = 0;

  for (const task of active.filter(isMustDo)) {
    if (used + task.estimatedMinutes <= budgetMinutes || planned.length === 0) {
      planned.push(task);
      used += task.estimatedMinutes;
    } else {
      mustDoOverflow.push(task);
    }
  }
  for (const task of active.filter((t) => !isMustDo(t))) {
    if (used + task.estimatedMinutes <= budgetMinutes) {
      planned.push(task);
      used += task.estimatedMinutes;
    }
  }

  // Present the chosen tasks in score order (input order), so the plan reads like the ranking.
  const order = new Map(active.map((t, i) => [t.id, i]));
  planned.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { planned, totalMinutes: used, budgetMinutes, mustDoOverflow };
}

export type InsightTone = 'danger' | 'warning' | 'info' | 'success';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  taskIds?: string[];
  pillarId?: string;
}

export function buildInsights(
  tasks: EnrichedTask[],
  pillars: PriorityPillar[],
  nowMs = Date.now()
): Insight[] {
  const active = tasks.filter((t) => t.status === 'needsAction');
  const insights: Insight[] = [];

  const overdue = active.filter((t) => (daysUntilDue(t.due, nowMs) ?? 1) < 0);
  if (overdue.length > 0) {
    insights.push({
      id: 'overdue',
      tone: 'danger',
      title: `${overdue.length} ${overdue.length === 1 ? 'tarea vencida' : 'tareas vencidas'}`,
      detail: 'Resolvelas primero o mové la fecha si ya no aplica.',
      taskIds: overdue.map((t) => t.id),
    });
  }

  const stale = active.filter((t) => getTaskAgeDays(t.createdAt, nowMs) >= 21 && t.priorityScore < 60);
  if (stale.length > 0) {
    insights.push({
      id: 'stale',
      tone: 'warning',
      title: `${stale.length} ${stale.length === 1 ? 'tarea lleva' : 'tareas llevan'} más de 3 semanas esperando`,
      detail: '¿Siguen siendo relevantes? Completalas, delegalas o borralas para despejar la lista.',
      taskIds: stale.map((t) => t.id),
    });
  }

  const big = active.filter((t) => t.estimatedMinutes >= 120);
  if (big.length > 0) {
    insights.push({
      id: 'big',
      tone: 'info',
      title: `${big.length} ${big.length === 1 ? 'tarea grande' : 'tareas grandes'} (2 h o más)`,
      detail: 'Dividirlas en pasos de menos de 1 hora hace más fácil empezarlas.',
      taskIds: big.map((t) => t.id),
    });
  }

  // Balance: high-weight pillars with no active tasks, or pillars hoarding the list.
  const total = Math.max(1, active.length);
  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of pillars) {
    const count = active.filter((t) => t.pillarId === p.id).length;
    if (p.weight >= 8 && count === 0) {
      insights.push({
        id: `neglected-${p.id}`,
        tone: 'warning',
        title: `Nada pendiente en ${p.name}`,
        detail: `Le diste peso ${p.weight}/10 pero no tiene tareas. ¿Hay algo que quieras agendar?`,
        pillarId: p.id,
      });
    }
    const share = count / total;
    const expected = p.weight / totalWeight;
    if (active.length >= 6 && share > expected * 2 && share > 0.35) {
      insights.push({
        id: `crowded-${p.id}`,
        tone: 'info',
        title: `${p.name} concentra el ${Math.round(share * 100)}% de tus tareas`,
        detail: 'Revisá si todas son necesarias o si alguna puede esperar.',
        pillarId: p.id,
      });
    }
  }

  if (insights.length === 0 && active.length > 0) {
    insights.push({
      id: 'ok',
      tone: 'success',
      title: 'Todo en orden',
      detail: 'Sin vencidas, sin tareas olvidadas y con tus áreas equilibradas.',
    });
  }

  return insights;
}
