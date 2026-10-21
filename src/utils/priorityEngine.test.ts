import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PILLARS,
  calculatePriorityScore,
  parseTaskMetadata,
  serializeTaskForGoogle,
  recalculateAllTasks,
  type EnrichedTask,
} from './priorityEngine.ts';

test('calculatePriorityScore assigns higher score to higher-weighted life pillars', () => {
  const now = new Date('2026-10-19T12:00:00Z').getTime();
  const createdAt = '2026-10-19T12:00:00Z';

  const saludScore = calculatePriorityScore(
    {
      pillarId: 'salud',
      urgency: 'high',
      impact: 'high',
      status: 'needsAction',
      createdAt,
    },
    DEFAULT_PILLARS,
    now
  );

  const ocioScore = calculatePriorityScore(
    {
      pillarId: 'ocio',
      urgency: 'high',
      impact: 'high',
      status: 'needsAction',
      createdAt,
    },
    DEFAULT_PILLARS,
    now
  );

  assert.ok(saludScore > ocioScore);
});

test('older tasks in the same category receive a higher priorityScore and are sorted first', () => {
  const now = new Date('2026-10-19T12:00:00Z').getTime();

  const newerTask: EnrichedTask = {
    id: 'task-newer',
    listId: 'l1',
    listTitle: 'Personal',
    title: 'Comprar vitaminas',
    cleanTitle: 'Comprar vitaminas',
    notes: '',
    cleanNotes: '',
    status: 'needsAction',
    createdAt: '2026-10-18T12:00:00Z', // 1 day old
    pillarId: 'salud',
    urgency: 'high',
    impact: 'high',
    estimatedMinutes: 20,
    ageBonusPoints: 0,
    priorityScore: 0,
  };

  const olderTask: EnrichedTask = {
    id: 'task-older',
    listId: 'l1',
    listTitle: 'Personal',
    title: 'Hacer análisis clínico',
    cleanTitle: 'Hacer análisis clínico',
    notes: '',
    cleanNotes: '',
    status: 'needsAction',
    createdAt: '2026-10-09T12:00:00Z', // 10 days old
    pillarId: 'salud',
    urgency: 'high',
    impact: 'high',
    estimatedMinutes: 20,
    ageBonusPoints: 0,
    priorityScore: 0,
  };

  const sorted = recalculateAllTasks([newerTask, olderTask], DEFAULT_PILLARS, now);
  assert.equal(sorted[0].id, 'task-older');
  assert.equal(sorted[1].id, 'task-newer');
  assert.ok(
    sorted[0].priorityScore > sorted[1].priorityScore,
    `Expected older task score (${sorted[0].priorityScore}) > newer task score (${sorted[1].priorityScore})`
  );
});

test('two tasks in the same category created minutes apart prioritize the one loaded first', () => {
  const now = new Date('2026-10-19T12:00:00Z').getTime();

  const loadedSecond: EnrichedTask = {
    id: 'second',
    listId: 'l1',
    listTitle: 'Personal',
    title: 'Tarea B',
    cleanTitle: 'Tarea B',
    notes: '',
    cleanNotes: '',
    status: 'needsAction',
    createdAt: '2026-10-19T11:55:00Z',
    pillarId: 'familia',
    urgency: 'medium',
    impact: 'medium',
    estimatedMinutes: 30,
    ageBonusPoints: 0,
    priorityScore: 0,
  };

  const loadedFirst: EnrichedTask = {
    id: 'first',
    listId: 'l1',
    listTitle: 'Personal',
    title: 'Tarea A',
    cleanTitle: 'Tarea A',
    notes: '',
    cleanNotes: '',
    status: 'needsAction',
    createdAt: '2026-10-19T11:50:00Z',
    pillarId: 'familia',
    urgency: 'medium',
    impact: 'medium',
    estimatedMinutes: 30,
    ageBonusPoints: 0,
    priorityScore: 0,
  };

  const sorted = recalculateAllTasks([loadedSecond, loadedFirst], DEFAULT_PILLARS, now);
  assert.equal(sorted[0].id, 'first');
  assert.equal(sorted[1].id, 'second');
  assert.ok(sorted[0].priorityScore > sorted[1].priorityScore);
});

test('completed tasks always receive a priorityScore of 0', () => {
  const score = calculatePriorityScore(
    {
      pillarId: 'salud',
      urgency: 'critical',
      impact: 'high',
      status: 'completed',
      createdAt: '2026-10-01T00:00:00Z',
    },
    DEFAULT_PILLARS
  );
  assert.equal(score, 0);
});

test('serializeTaskForGoogle and parseTaskMetadata round-trip cleanly including createdAt', () => {
  const original = {
    cleanTitle: 'Control odontológico semestral',
    cleanNotes: 'Llevar radiografía panorámica',
    pillarId: 'salud',
    urgency: 'high' as const,
    impact: 'high' as const,
    estimatedMinutes: 45,
    createdAt: '2026-10-05T14:30:00.000Z',
  };

  const serialized = serializeTaskForGoogle(original, DEFAULT_PILLARS, true);
  assert.equal(serialized.title, '[Salud] Control odontológico semestral');
  assert.ok(serialized.notes.includes('Creada: 2026-10-05T14:30:00.000Z'));

  const parsed = parseTaskMetadata(serialized.title, serialized.notes, DEFAULT_PILLARS);
  assert.equal(parsed.cleanTitle, 'Control odontológico semestral');
  assert.equal(parsed.cleanNotes, 'Llevar radiografía panorámica');
  assert.equal(parsed.pillarId, 'salud');
  assert.equal(parsed.urgency, 'high');
  assert.equal(parsed.impact, 'high');
  assert.equal(parsed.estimatedMinutes, 45);
  assert.equal(parsed.createdAt, '2026-10-05T14:30:00.000Z');
});
