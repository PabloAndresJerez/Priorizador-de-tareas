import { daysUntilDue } from './dates';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
export type ImpactLevel = 'low' | 'medium' | 'high';
export type QuadrantId = 'do' | 'plan' | 'quick' | 'later';

export interface PriorityPillar {
  id: string;
  name: string;
  description: string;
  weight: number; // 1 to 10 (10 = highest life priority)
  rank: number; // 1-indexed order of importance
  keywords: string[];
  accentHex: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

/** Points each factor contributed to the final score, so the UI can explain it. */
export interface ScoreBreakdown {
  importance: number; // 0..40  pillar weight x impact
  urgency: number; // 0..35  continuous, derived from due date and manual urgency
  age: number; // 0..15  time waiting + FIFO seniority within the pillar
  effort: number; // 0..10  quick wins get a boost
}

export interface EnrichedTask {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  cleanTitle: string;
  notes: string;
  cleanNotes: string;
  status: 'needsAction' | 'completed';
  due?: string; // ISO date string (Google stores date-only values at midnight UTC)
  createdAt: string; // ISO date string representing when the task was first loaded/created
  position?: string;
  parent?: string; // Google Tasks parent id when this is a subtask
  pillarId: string;
  urgency: UrgencyLevel;
  impact: ImpactLevel;
  estimatedMinutes: number;
  ageBonusPoints: number;
  priorityScore: number;
  breakdown?: ScoreBreakdown;
  reasons?: string[];
  quadrant?: QuadrantId;
  isDirty?: boolean;
}

export const DEFAULT_PILLARS: PriorityPillar[] = [
  {
    id: 'salud',
    name: 'Salud y Bienestar',
    description: 'Ejercicio físico, consultas médicas, descanso, nutrición y salud mental.',
    weight: 10,
    rank: 1,
    keywords: ['médico', 'doctor', 'salud', 'gimnasio', 'gym', 'correr', 'dentista', 'odontólogo', 'terapia', 'psicólogo', 'análisis', 'entrenar', 'entrenamiento', 'dormir', 'nutrición', 'receta', 'farmacia', 'turno', 'clínica', 'caminar', 'yoga', 'meditar'],
    accentHex: '#0F766E', // deep teal
  },
  {
    id: 'familia',
    name: 'Familia y Vínculos',
    description: 'Tiempo de calidad, cuidado familiar, eventos importantes y hogar.',
    weight: 9,
    rank: 2,
    keywords: ['familia', 'mamá', 'papá', 'hijos', 'hija', 'hijo', 'cena', 'cumpleaños', 'escuela', 'colegio', 'casa', 'hogar', 'pareja', 'visitar', 'llamar a', 'abuelos', 'chicos', 'maestra'],
    accentHex: '#B45309', // warm amber-ochre
  },
  {
    id: 'trabajo',
    name: 'Trabajo y Carrera',
    description: 'Proyectos clave, entregas profesionales, clientes y objetivos laborales.',
    weight: 8,
    rank: 3,
    keywords: ['informe', 'cliente', 'reunión', 'proyecto', 'entrega', 'entregar', 'presentación', 'correo', 'mail', 'equipo', 'sprint', 'propuesta', 'trabajo', 'backlog', 'retrospectiva', 'jefe', 'oficina', 'deploy'],
    accentHex: '#1D4ED8', // royal blue
  },
  {
    id: 'finanzas',
    name: 'Finanzas y Administración',
    description: 'Pagos, impuestos, inversiones, trámites y control de gastos.',
    weight: 7,
    rank: 4,
    keywords: ['pagar', 'pago', 'factura', 'banco', 'impuestos', 'afip', 'arca', 'alquiler', 'seguro', 'tarjeta', 'inversión', 'presupuesto', 'transferencia', 'sueldo', 'gastos', 'trámite', 'vencimiento'],
    accentHex: '#4338CA', // indigo
  },
  {
    id: 'crecimiento',
    name: 'Aprendizaje y Hábitos',
    description: 'Lectura, cursos, idiomas y desarrollo de habilidades personales.',
    weight: 6,
    rank: 5,
    keywords: ['leer', 'libro', 'curso', 'estudiar', 'aprender', 'inglés', 'práctica', 'clase', 'taller', 'módulo', 'certificación'],
    accentHex: '#6D28D9', // deep violet
  },
  {
    id: 'ocio',
    name: 'Ocio y Recreación',
    description: 'Hobbies, viajes, cultura, amigos y desconexión creativa.',
    weight: 5,
    rank: 6,
    keywords: ['cine', 'viaje', 'vacaciones', 'juego', 'música', 'serie', 'concierto', 'amigos', 'paseo', 'regalo', 'ocio', 'teatro', 'entradas', 'asado'],
    accentHex: '#BE185D', // crimson rose
  },
];

// Manual urgency is used on its own when a task has no due date, and as a floor when it has one.
const MANUAL_URGENCY_FACTOR: Record<UrgencyLevel, number> = {
  critical: 1,
  high: 0.72,
  medium: 0.42,
  low: 0.15,
};

const IMPACT_FACTOR: Record<ImpactLevel, number> = {
  high: 1,
  medium: 0.65,
  low: 0.3,
};

const MAX_POINTS = { importance: 40, urgency: 35, age: 12, seniority: 3, effort: 10 };

const URGENT_THRESHOLD = 0.6;
const IMPORTANT_THRESHOLD = 0.7;

const METADATA_REGEX =
  /\n?\[Prioridad:\s*([^|\]]+?)\s*\|\s*Urgencia:\s*([^|\]]+?)\s*\|\s*Impacto:\s*([^|\]]+?)(?:\s*\|\s*Min:\s*(\d+))?(?:\s*\|\s*Creada:\s*([^\]]+))?\]\s*$/i;
const TITLE_PREFIX_REGEX = /^\[([^\]]+)\]\s+/;

/** Lowercases and strips accents so "Médico" matches "medico". */
export function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(/[^a-z0-9ñ]+/).filter(Boolean);
}

/**
 * Bonus points (0 to 12) for how long a task has been waiting.
 * Logarithmic: the first days matter most, so old tasks rise without drowning everything else.
 */
export function calculateAgeBonusPoints(createdAtIso?: string, nowMs = Date.now()): number {
  if (!createdAtIso) return 0;
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) return 0;
  const diffDays = Math.max(0, nowMs - createdMs) / (1000 * 60 * 60 * 24);
  if (diffDays >= 0.04 && diffDays < 0.5) return 1;
  return Math.min(MAX_POINTS.age, Math.round((Math.log1p(diffDays) / Math.log1p(30)) * MAX_POINTS.age));
}

export function getTaskAgeDays(createdAtIso?: string, nowMs = Date.now()): number {
  if (!createdAtIso) return 0;
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));
}

/** 0..1 urgency derived from the due date: overdue = 1, today ≈ 0.95, decaying over ~2 weeks. */
export function dueUrgencyFactor(dueIso?: string, nowMs = Date.now()): number | undefined {
  const days = daysUntilDue(dueIso, nowMs);
  if (days === undefined) return undefined;
  if (days < 0) return 1;
  if (days === 0) return 0.95;
  return Math.max(0.05, 0.9 * Math.exp(-(days - 1) / 4.5));
}

export function urgencyFactor(
  task: Pick<EnrichedTask, 'urgency' | 'due'>,
  nowMs = Date.now()
): number {
  const manual = MANUAL_URGENCY_FACTOR[task.urgency] ?? 0.42;
  const fromDue = dueUrgencyFactor(task.due, nowMs);
  return fromDue === undefined ? manual : Math.max(fromDue, manual * 0.85);
}

export function importanceFactor(
  task: Pick<EnrichedTask, 'pillarId' | 'impact'>,
  pillars: PriorityPillar[]
): number {
  const pillar = pillars.find((p) => p.id === task.pillarId);
  const weight = pillar ? Math.min(10, Math.max(1, pillar.weight)) : 5;
  return 0.55 * (weight / 10) + 0.45 * (IMPACT_FACTOR[task.impact] ?? 0.65);
}

/** Short tasks are easier to start: 10 min → 10 pts, 3 h or more → 0 pts. */
export function effortPoints(estimatedMinutes: number): number {
  const minutes = Math.max(5, estimatedMinutes || 30);
  const ratio = 1 - Math.min(1, Math.max(0, (minutes - 10) / 170));
  return Math.round(ratio * MAX_POINTS.effort);
}

export function classifyQuadrant(urgency: number, importance: number): QuadrantId {
  const urgent = urgency >= URGENT_THRESHOLD;
  const important = importance >= IMPORTANT_THRESHOLD;
  if (urgent && important) return 'do';
  if (!urgent && important) return 'plan';
  if (urgent && !important) return 'quick';
  return 'later';
}

export function parseTaskMetadata(
  rawTitle: string,
  rawNotes: string | undefined,
  pillars: PriorityPillar[],
  dueIso?: string,
  fallbackCreatedAtIso?: string,
  listTitle = ''
): {
  cleanTitle: string;
  cleanNotes: string;
  pillarId: string;
  urgency: UrgencyLevel;
  impact: ImpactLevel;
  estimatedMinutes: number;
  createdAt: string;
} {
  const safeNotes = rawNotes || '';
  const match = safeNotes.match(METADATA_REGEX);

  // Only strip a "[Prefix]" when it names one of our pillars, so titles like "[URGENTE] ..." survive.
  const prefixMatch = (rawTitle || '').match(TITLE_PREFIX_REGEX);
  const prefixPillar = prefixMatch ? findPillarByLabel(prefixMatch[1], pillars) : undefined;
  let cleanTitle = (prefixPillar ? rawTitle.replace(TITLE_PREFIX_REGEX, '') : rawTitle || '').trim();
  if (!cleanTitle) cleanTitle = rawTitle || 'Tarea sin título';

  const cleanNotes = safeNotes.replace(METADATA_REGEX, '').trim();
  const defaultCreated =
    fallbackCreatedAtIso && !Number.isNaN(new Date(fallbackCreatedAtIso).getTime())
      ? new Date(fallbackCreatedAtIso).toISOString()
      : new Date().toISOString();
  const text = `${cleanTitle} ${cleanNotes}`;

  if (match) {
    const [, rawPillarName, rawUrg, rawImp, rawMin, rawCreated] = match;
    const foundPillar = findPillarByLabel(rawPillarName, pillars);
    const urgencyMap: Record<string, UrgencyLevel> = {
      critica: 'critical',
      critical: 'critical',
      alta: 'high',
      high: 'high',
      media: 'medium',
      medium: 'medium',
      baja: 'low',
      low: 'low',
    };
    const impactMap: Record<string, ImpactLevel> = {
      alto: 'high',
      alta: 'high',
      high: 'high',
      medio: 'medium',
      media: 'medium',
      medium: 'medium',
      bajo: 'low',
      baja: 'low',
      low: 'low',
    };

    const parsedCreated =
      rawCreated && !Number.isNaN(new Date(rawCreated.trim()).getTime())
        ? new Date(rawCreated.trim()).toISOString()
        : defaultCreated;

    return {
      cleanTitle,
      cleanNotes,
      pillarId: foundPillar ? foundPillar.id : inferPillarFromText(text, pillars, listTitle),
      urgency: urgencyMap[normalizeText(rawUrg.trim())] || inferUrgencyFromDue(dueIso, cleanTitle),
      impact: impactMap[normalizeText(rawImp.trim())] || 'medium',
      estimatedMinutes: rawMin ? Math.max(5, parseInt(rawMin, 10)) : inferMinutesFromText(text),
      createdAt: parsedCreated,
    };
  }

  return {
    cleanTitle,
    cleanNotes,
    pillarId: prefixPillar?.id || inferPillarFromText(text, pillars, listTitle),
    urgency: inferUrgencyFromDue(dueIso, cleanTitle),
    impact: inferImpactFromText(text),
    estimatedMinutes: inferMinutesFromText(text),
    createdAt: defaultCreated,
  };
}

export function findPillarByLabel(label: string, pillars: PriorityPillar[]): PriorityPillar | undefined {
  const needle = normalizeText(label.trim());
  if (!needle) return undefined;
  return (
    pillars.find((p) => normalizeText(p.id) === needle || normalizeText(p.name) === needle) ||
    pillars.find((p) => normalizeText(p.name.split(' ')[0]) === needle) ||
    pillars.find((p) => normalizeText(p.name).startsWith(needle))
  );
}

/**
 * Scores every pillar by how many of its keywords appear as whole words (or a short
 * inflection, so "entrenar" matches "entrenaré") in the task text. The list name counts as a weaker signal.
 * Ties go to the pillar with the higher weight. Previously the first substring hit won,
 * so "casamiento" matched "casa" and every unmatched task landed in the first pillar.
 */
export function inferPillarFromText(text: string, pillars: PriorityPillar[], listTitle = ''): string {
  const textTokens = tokenize(text);
  const listTokens = tokenize(listTitle);
  const normalizedText = ` ${textTokens.join(' ')} `;
  const normalizedList = ` ${listTokens.join(' ')} `;

  const keywordHits = (tokens: string[], joined: string, kw: string) => {
    const nk = normalizeText(kw).trim();
    if (!nk) return false;
    if (nk.includes(' ')) return joined.includes(` ${nk} `) || joined.includes(` ${nk}`);
    return tokens.some((t) => t === nk || (nk.length >= 4 && t.startsWith(nk) && t.length - nk.length <= 3));
  };

  let best: { id: string; score: number; weight: number } | null = null;
  for (const pillar of pillars) {
    let score = 0;
    const allKeywords = [...pillar.keywords, pillar.name.split(' ')[0]];
    for (const kw of allKeywords) {
      if (keywordHits(textTokens, normalizedText, kw)) score += 1;
      if (keywordHits(listTokens, normalizedList, kw)) score += 0.5;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && pillar.weight > best.weight))) {
      best = { id: pillar.id, score, weight: pillar.weight };
    }
  }
  if (best) return best.id;

  // No signal at all: use the middle-weight pillar instead of always the most important one.
  const sorted = [...pillars].sort((a, b) => b.weight - a.weight);
  return sorted[Math.floor(sorted.length / 2)]?.id || pillars[0]?.id || 'salud';
}

export function inferUrgencyFromDue(dueIso?: string, text = ''): UrgencyLevel {
  const lower = normalizeText(text);
  if (/\b(urgente|hoy|inmediato|asap)\b/.test(lower)) {
    return 'critical';
  }
  const days = daysUntilDue(dueIso);
  if (days !== undefined) {
    if (days <= 1) return 'critical';
    if (days <= 3) return 'high';
    if (days <= 7) return 'medium';
    return 'low';
  }
  return 'medium';
}

export function inferImpactFromText(text: string): ImpactLevel {
  const lower = normalizeText(text);
  if (/\b(importante|clave|medico|salud|familia|entrega|entregar|anual|vence|vencimiento|impuesto|impuestos|cliente)/.test(lower)) {
    return 'high';
  }
  if (/\b(revisar|opcional|algun dia|quizas|tal vez|ver si)\b/.test(lower)) {
    return 'low';
  }
  return 'medium';
}

/** Picks up durations written in the task ("(45 min)", "1h", "2 horas"); defaults to 30. */
export function inferMinutesFromText(text: string): number {
  const lower = normalizeText(text);
  const hm = /(\d+)\s*h(?:s|oras?)?\s*(\d+)\s*(?:m|min)?\b/.exec(lower);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h|hs|hora|horas)\b/.exec(lower);
  if (h) return Math.round(parseFloat(h[1].replace(',', '.')) * 60);
  const m = /(\d+)\s*(?:m|min|mins|minutos)\b/.exec(lower);
  if (m) return Math.max(5, Number(m[1]));
  return 30;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
  quadrant: QuadrantId;
}

export function scoreTask(
  task: Pick<EnrichedTask, 'pillarId' | 'urgency' | 'impact' | 'due' | 'status'> & {
    createdAt?: string;
    estimatedMinutes?: number;
    seniorityBonus?: number;
  },
  pillars: PriorityPillar[],
  nowMs = Date.now()
): ScoreResult {
  const pillar = pillars.find((p) => p.id === task.pillarId);
  const imp = importanceFactor(task, pillars);
  const urg = urgencyFactor(task, nowMs);
  const quadrant = classifyQuadrant(urg, imp);

  if (task.status === 'completed') {
    return { score: 0, breakdown: { importance: 0, urgency: 0, age: 0, effort: 0 }, reasons: [], quadrant };
  }

  const breakdown: ScoreBreakdown = {
    importance: Math.round(imp * MAX_POINTS.importance),
    urgency: Math.round(urg * MAX_POINTS.urgency),
    age: calculateAgeBonusPoints(task.createdAt, nowMs) + Math.min(MAX_POINTS.seniority, task.seniorityBonus ?? 0),
    effort: effortPoints(task.estimatedMinutes ?? 30),
  };
  const score = Math.min(
    100,
    breakdown.importance + breakdown.urgency + breakdown.age + breakdown.effort
  );

  const reasons: string[] = [];
  const days = daysUntilDue(task.due, nowMs);
  if (days !== undefined) {
    if (days < 0) reasons.push(`Vencida hace ${-days} ${-days === 1 ? 'día' : 'días'}`);
    else if (days === 0) reasons.push('Vence hoy');
    else if (days === 1) reasons.push('Vence mañana');
    else if (days <= 7) reasons.push(`Vence en ${days} días`);
  } else if (task.urgency === 'critical' || task.urgency === 'high') {
    reasons.push(task.urgency === 'critical' ? 'Marcada como crítica' : 'Urgencia alta');
  }
  if (pillar && pillar.weight >= 8) reasons.push(`${pillar.name.split(' ')[0]} es prioridad ${pillar.weight}/10`);
  if (task.impact === 'high') reasons.push('Impacto alto');
  const ageDays = getTaskAgeDays(task.createdAt, nowMs);
  if (ageDays >= 7) reasons.push(`Esperando hace ${ageDays} días`);
  if ((task.estimatedMinutes ?? 30) <= 15) reasons.push(`Rápida (${task.estimatedMinutes} min)`);

  return { score, breakdown, reasons, quadrant };
}

export function calculatePriorityScore(
  task: Parameters<typeof scoreTask>[0],
  pillars: PriorityPillar[],
  nowMs = Date.now()
): number {
  return scoreTask(task, pillars, nowMs).score;
}

export function serializeTaskForGoogle(
  task: Pick<
    EnrichedTask,
    'cleanTitle' | 'cleanNotes' | 'pillarId' | 'urgency' | 'impact' | 'estimatedMinutes'
  > & { createdAt?: string },
  pillars: PriorityPillar[],
  includeTitlePrefix = true
): { title: string; notes: string } {
  const pillar = pillars.find((p) => p.id === task.pillarId);
  const pillarLabel = pillar ? pillar.name.split(' ')[0] : task.pillarId;

  const urgencyLabels: Record<UrgencyLevel, string> = {
    critical: 'Crítica',
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
  };
  const impactLabels: Record<ImpactLevel, string> = {
    high: 'Alto',
    medium: 'Medio',
    low: 'Bajo',
  };

  const createdIso = task.createdAt || new Date().toISOString();
  const metadataLine = `[Prioridad: ${pillar ? pillar.name : task.pillarId} | Urgencia: ${urgencyLabels[task.urgency]} | Impacto: ${impactLabels[task.impact]} | Min: ${task.estimatedMinutes} | Creada: ${createdIso}]`;
  const notes = task.cleanNotes ? `${task.cleanNotes.trim()}\n${metadataLine}` : metadataLine;
  const title = includeTitlePrefix ? `[${pillarLabel}] ${task.cleanTitle}` : task.cleanTitle;

  return { title, notes };
}

export function compareTasksByPriorityAndAge(
  a: EnrichedTask,
  b: EnrichedTask,
  pillars: PriorityPillar[]
): number {
  if (a.status !== b.status) {
    return a.status === 'needsAction' ? -1 : 1;
  }
  if (b.priorityScore !== a.priorityScore) {
    return b.priorityScore - a.priorityScore;
  }
  // Older task (smaller createdAt timestamp) is always prioritized first
  const timeA = new Date(a.createdAt || 0).getTime();
  const timeB = new Date(b.createdAt || 0).getTime();
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  const rankMap = new Map<string, number>();
  pillars.forEach((p, idx) => rankMap.set(p.id, p.rank ?? idx + 1));
  const rankA = rankMap.get(a.pillarId) ?? 99;
  const rankB = rankMap.get(b.pillarId) ?? 99;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.cleanTitle.localeCompare(b.cleanTitle, 'es');
}

export function sortTasksByPriority(tasks: EnrichedTask[], pillars: PriorityPillar[]): EnrichedTask[] {
  return [...tasks].sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars));
}

export function recalculateAllTasks(
  tasks: EnrichedTask[],
  pillars: PriorityPillar[],
  nowMs = Date.now()
): EnrichedTask[] {
  // Compute seniority order within each category (oldest task in category gets highest FIFO bonus)
  const seniorityMap = new Map<string, number>();

  for (const pillar of pillars) {
    const activeInPillar = tasks
      .filter((t) => t.pillarId === pillar.id && t.status === 'needsAction')
      .sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );

    const count = activeInPillar.length;
    activeInPillar.forEach((t, idx) => {
      const fifoPoints = count > 1 ? Math.min(MAX_POINTS.seniority, count - 1 - idx) : 0;
      seniorityMap.set(t.id, fifoPoints);
    });
  }

  const updated = tasks.map((t) => {
    const seniorityBonus = seniorityMap.get(t.id) ?? 0;
    const result = scoreTask({ ...t, seniorityBonus }, pillars, nowMs);
    return {
      ...t,
      ageBonusPoints: result.breakdown.age,
      priorityScore: result.score,
      breakdown: result.breakdown,
      reasons: result.reasons,
      quadrant: result.quadrant,
    };
  });

  return sortTasksByPriority(updated, pillars);
}

export const QUADRANT_META: Record<QuadrantId, { title: string; subtitle: string; tone: string }> = {
  do: { title: 'Hacer ahora', subtitle: 'Urgente e importante', tone: '#DC2626' },
  plan: { title: 'Planificar', subtitle: 'Importante, sin apuro', tone: '#2563EB' },
  quick: { title: 'Resolver rápido', subtitle: 'Urgente, menos importante', tone: '#D97706' },
  later: { title: 'Más adelante', subtitle: 'Ni urgente ni clave', tone: '#64748B' },
};

