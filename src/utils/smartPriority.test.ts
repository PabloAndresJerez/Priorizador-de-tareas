import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PILLARS,
  inferPillarFromText,
  inferMinutesFromText,
  parseTaskMetadata,
  recalculateAllTasks,
  scoreTask,
  type EnrichedTask,
} from './priorityEngine.ts';
import { daysUntilDue, dueToYmd, formatDueLabel } from './dates.ts';
import { parseQuickAdd } from './quickAddParser.ts';
import { buildDailyPlan, buildInsights } from './planner.ts';

// Wednesday 21 Oct 2026, 10:00 local time
const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();

function makeTask(overrides: Partial<EnrichedTask>): EnrichedTask {
  return {
    id: 't',
    listId: 'l1',
    listTitle: 'Personal',
    title: 'Tarea',
    cleanTitle: 'Tarea',
    notes: '',
    cleanNotes: '',
    status: 'needsAction',
    createdAt: new Date(NOW).toISOString(),
    pillarId: 'trabajo',
    urgency: 'medium',
    impact: 'medium',
    estimatedMinutes: 30,
    ageBonusPoints: 0,
    priorityScore: 0,
    ...overrides,
  };
}

test('Google date-only due values are read as calendar dates, not shifted by timezone', () => {
  assert.equal(dueToYmd('2026-10-22T00:00:00.000Z'), '2026-10-22');
  assert.equal(daysUntilDue('2026-10-22T00:00:00.000Z', NOW), 1);
  assert.equal(daysUntilDue('2026-10-21T00:00:00.000Z', NOW), 0);
  assert.equal(formatDueLabel('2026-10-19T00:00:00.000Z', NOW), 'Vencida hace 2 días');
});

test('urgency follows the due date: overdue beats due next week with everything else equal', () => {
  const overdue = scoreTask(makeTask({ due: '2026-10-19T00:00:00.000Z' }), DEFAULT_PILLARS, NOW);
  const nextWeek = scoreTask(makeTask({ due: '2026-10-28T00:00:00.000Z' }), DEFAULT_PILLARS, NOW);
  assert.ok(overdue.score > nextWeek.score);
  assert.ok(overdue.breakdown.urgency > nextWeek.breakdown.urgency);
  assert.ok(overdue.reasons.some((r) => r.startsWith('Vencida')));
});

test('a quick task gets an effort bonus over a long one', () => {
  const quick = scoreTask(makeTask({ estimatedMinutes: 10 }), DEFAULT_PILLARS, NOW);
  const long = scoreTask(makeTask({ estimatedMinutes: 180 }), DEFAULT_PILLARS, NOW);
  assert.equal(quick.breakdown.effort, 10);
  assert.equal(long.breakdown.effort, 0);
});

test('breakdown adds up to the score and scores stay spread out instead of saturating at 100', () => {
  const result = scoreTask(
    makeTask({ pillarId: 'salud', urgency: 'critical', impact: 'high', estimatedMinutes: 10 }),
    DEFAULT_PILLARS,
    NOW
  );
  const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
  assert.equal(result.score, Math.min(100, sum));
  const low = scoreTask(makeTask({ pillarId: 'ocio', urgency: 'low', impact: 'low', estimatedMinutes: 120 }), DEFAULT_PILLARS, NOW);
  assert.ok(result.score - low.score >= 50, `${result.score} vs ${low.score}`);
});

test('quadrants follow urgency and importance', () => {
  assert.equal(scoreTask(makeTask({ pillarId: 'salud', impact: 'high', urgency: 'critical' }), DEFAULT_PILLARS, NOW).quadrant, 'do');
  assert.equal(scoreTask(makeTask({ pillarId: 'salud', impact: 'high', urgency: 'low' }), DEFAULT_PILLARS, NOW).quadrant, 'plan');
  assert.equal(scoreTask(makeTask({ pillarId: 'ocio', impact: 'low', urgency: 'critical' }), DEFAULT_PILLARS, NOW).quadrant, 'quick');
  assert.equal(scoreTask(makeTask({ pillarId: 'ocio', impact: 'low', urgency: 'low' }), DEFAULT_PILLARS, NOW).quadrant, 'later');
});

test('pillar inference ignores accents, avoids partial-word false positives and uses the list name', () => {
  assert.equal(inferPillarFromText('Turno con el medico', DEFAULT_PILLARS), 'salud');
  // "casamiento" used to match "casa" (familia)
  assert.notEqual(inferPillarFromText('Pagar el salón del casamiento', DEFAULT_PILLARS), 'familia');
  assert.equal(inferPillarFromText('Pagar el salón del casamiento', DEFAULT_PILLARS), 'finanzas');
  assert.equal(inferPillarFromText('Preparar slides', DEFAULT_PILLARS, 'Trabajo'), 'trabajo');
});

test('durations written in the title are picked up', () => {
  assert.equal(inferMinutesFromText('Entrenamiento funcional (45 min)'), 45);
  assert.equal(inferMinutesFromText('Estudiar 2 horas'), 120);
  assert.equal(inferMinutesFromText('Revisar 1h30'), 90);
  assert.equal(inferMinutesFromText('Sin duración'), 30);
});

test('titles keep bracket prefixes that are not pillar names', () => {
  const parsed = parseTaskMetadata('[URGENTE] Llamar al banco', '', DEFAULT_PILLARS);
  assert.equal(parsed.cleanTitle, '[URGENTE] Llamar al banco');
  const prefixed = parseTaskMetadata('[Salud] Turno dentista', '', DEFAULT_PILLARS);
  assert.equal(prefixed.cleanTitle, 'Turno dentista');
  assert.equal(prefixed.pillarId, 'salud');
});

test('quick add understands dates, durations, pillars and urgency in natural language', () => {
  const draft = parseQuickAdd('Pagar tarjeta mañana 15m #finanzas !alta', DEFAULT_PILLARS, NOW);
  assert.equal(draft.title, 'Pagar tarjeta');
  assert.equal(draft.dueYmd, '2026-10-22');
  assert.equal(draft.estimatedMinutes, 15);
  assert.equal(draft.pillarId, 'finanzas');
  assert.equal(draft.pillarExplicit, true);
  assert.equal(draft.urgency, 'high');

  const friday = parseQuickAdd('Turno dentista el viernes 1h', DEFAULT_PILLARS, NOW);
  assert.equal(friday.title, 'Turno dentista');
  assert.equal(friday.dueYmd, '2026-10-23');
  assert.equal(friday.estimatedMinutes, 60);
  assert.equal(friday.pillarId, 'salud');

  const dated = parseQuickAdd('Entregar propuesta 28/10 !!! *alto', DEFAULT_PILLARS, NOW);
  assert.equal(dated.title, 'Entregar propuesta');
  assert.equal(dated.dueYmd, '2026-10-28');
  assert.equal(dated.urgency, 'critical');
  assert.equal(dated.impact, 'high');

  const inDays = parseQuickAdd('Leer capítulo en 3 días', DEFAULT_PILLARS, NOW);
  assert.equal(inDays.dueYmd, '2026-10-24');
  assert.equal(inDays.pillarId, 'crecimiento');
});

test('daily plan guarantees overdue tasks and fills the remaining time by score', () => {
  const tasks = recalculateAllTasks(
    [
      makeTask({ id: 'big', pillarId: 'salud', impact: 'high', estimatedMinutes: 90 }),
      makeTask({ id: 'overdue', pillarId: 'ocio', impact: 'low', due: '2026-10-18T00:00:00.000Z', estimatedMinutes: 30 }),
      makeTask({ id: 'small', pillarId: 'trabajo', estimatedMinutes: 20 }),
    ],
    DEFAULT_PILLARS,
    NOW
  );
  const plan = buildDailyPlan(tasks, 60, NOW);
  // "big" scores highest but does not fit next to the overdue task
  assert.deepEqual(new Set(plan.planned.map((t) => t.id)), new Set(['overdue', 'small']));
  assert.equal(plan.totalMinutes, 50);
});

test('insights flag overdue tasks and neglected high-weight pillars', () => {
  const tasks = recalculateAllTasks(
    [makeTask({ id: 'a', due: '2026-10-18T00:00:00.000Z' })],
    DEFAULT_PILLARS,
    NOW
  );
  const insights = buildInsights(tasks, DEFAULT_PILLARS, NOW);
  assert.ok(insights.some((i) => i.id === 'overdue'));
  assert.ok(insights.some((i) => i.id === 'neglected-salud'));
});
