export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
export type ImpactLevel = 'low' | 'medium' | 'high';

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

export interface EnrichedTask {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  cleanTitle: string;
  notes: string;
  cleanNotes: string;
  status: 'needsAction' | 'completed';
  due?: string; // ISO date string
  createdAt: string; // ISO date string representing when the task was first loaded/created
  position?: string;
  pillarId: string;
  urgency: UrgencyLevel;
  impact: ImpactLevel;
  estimatedMinutes: number;
  ageBonusPoints: number;
  priorityScore: number;
  isDirty?: boolean;
}

export const DEFAULT_PILLARS: PriorityPillar[] = [
  {
    id: 'salud',
    name: 'Salud y Bienestar',
    description: 'Ejercicio físico, consultas médicas, descanso, nutrición y salud mental.',
    weight: 10,
    rank: 1,
    keywords: ['médico', 'doctor', 'salud', 'gimnasio', 'correr', 'dentista', 'terapia', 'análisis', 'entrenar', 'dormir', 'nutrición', 'receta', 'farmacia', 'turno'],
    accentHex: '#0F766E', // deep teal
  },
  {
    id: 'familia',
    name: 'Familia y Vínculos',
    description: 'Tiempo de calidad, cuidado familiar, eventos importantes y hogar.',
    weight: 9,
    rank: 2,
    keywords: ['familia', 'mamá', 'papá', 'hijos', 'cena', 'cumpleaños', 'escuela', 'colegio', 'casa', 'hogar', 'pareja', 'visitar', 'llamar a'],
    accentHex: '#B45309', // warm amber-ochre
  },
  {
    id: 'trabajo',
    name: 'Trabajo y Carrera',
    description: 'Proyectos clave, entregas profesionales, clientes y objetivos laborales.',
    weight: 8,
    rank: 3,
    keywords: ['informe', 'cliente', 'reunión', 'proyecto', 'entrega', 'presentación', 'presupuesto', 'correo', 'equipo', 'sprint', 'propuesta', 'trabajo'],
    accentHex: '#1D4ED8', // royal blue
  },
  {
    id: 'finanzas',
    name: 'Finanzas y Administración',
    description: 'Pagos, impuestos, inversiones, trámites y control de gastos.',
    weight: 7,
    rank: 4,
    keywords: ['pagar', 'factura', 'banco', 'impuestos', 'alquiler', 'seguro', 'tarjeta', 'inversión', 'presupuesto', 'transferencia', 'sueldo'],
    accentHex: '#4338CA', // indigo
  },
  {
    id: 'crecimiento',
    name: 'Aprendizaje y Hábitos',
    description: 'Lectura, cursos, idiomas y desarrollo de habilidades personales.',
    weight: 6,
    rank: 5,
    keywords: ['leer', 'libro', 'curso', 'estudiar', 'aprender', 'inglés', 'práctica', 'clase', 'taller'],
    accentHex: '#6D28D9', // deep violet
  },
  {
    id: 'ocio',
    name: 'Ocio y Recreación',
    description: 'Hobbies, viajes, cultura, amigos y desconexión creativa.',
    weight: 5,
    rank: 6,
    keywords: ['cine', 'viaje', 'vacaciones', 'juego', 'música', 'serie', 'concierto', 'amigos', 'paseo', 'comprar', 'regalo', 'ocio'],
    accentHex: '#BE185D', // crimson rose
  },
];

const URGENCY_POINTS: Record<UrgencyLevel, number> = {
  critical: 28,
  high: 20,
  medium: 12,
  low: 4,
};

const IMPACT_POINTS: Record<ImpactLevel, number> = {
  high: 20,
  medium: 12,
  low: 5,
};

const METADATA_REGEX =
  /\n?\[Prioridad:\s*([^|\]]+?)\s*\|\s*Urgencia:\s*([^|\]]+?)\s*\|\s*Impacto:\s*([^|\]]+?)(?:\s*\|\s*Min:\s*(\d+))?(?:\s*\|\s*Creada:\s*([^\]]+))?\]\s*$/i;
const TITLE_PREFIX_REGEX = /^\[([^\]]+)\]\s+/;

/**
 * Calculates bonus points (0 to 18) based on task age (antigüedad).
 * Older tasks receive a higher score so tasks loaded earlier are prioritized first.
 */
export function calculateAgeBonusPoints(createdAtIso?: string, nowMs = Date.now()): number {
  if (!createdAtIso) return 0;
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) return 0;

  const diffMs = Math.max(0, nowMs - createdMs);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // 1.5 points per day of age, up to 18 points max (reached at 12 days old)
  // Plus 1 point if at least 1 hour old so older same-day tasks get a visible boost
  if (diffDays >= 0.04 && diffDays < 0.7) {
    return 1;
  }
  return Math.min(18, Math.round(diffDays * 1.5));
}

export function getTaskAgeDays(createdAtIso?: string, nowMs = Date.now()): number {
  if (!createdAtIso) return 0;
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));
}

export function parseTaskMetadata(
  rawTitle: string,
  rawNotes: string | undefined,
  pillars: PriorityPillar[],
  dueIso?: string,
  fallbackCreatedAtIso?: string
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

  let cleanTitle = (rawTitle || 'Tarea sin título').replace(TITLE_PREFIX_REGEX, '').trim();
  if (!cleanTitle) cleanTitle = rawTitle || 'Tarea sin título';

  const cleanNotes = safeNotes.replace(METADATA_REGEX, '').trim();
  const defaultCreated =
    fallbackCreatedAtIso && !Number.isNaN(new Date(fallbackCreatedAtIso).getTime())
      ? new Date(fallbackCreatedAtIso).toISOString()
      : new Date().toISOString();

  if (match) {
    const [, rawPillarName, rawUrg, rawImp, rawMin, rawCreated] = match;
    const foundPillar = pillars.find(
      (p) =>
        p.id.toLowerCase() === rawPillarName.trim().toLowerCase() ||
        p.name.toLowerCase() === rawPillarName.trim().toLowerCase()
    );
    const urgencyMap: Record<string, UrgencyLevel> = {
      critica: 'critical',
      crítica: 'critical',
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
      pillarId: foundPillar
        ? foundPillar.id
        : inferPillarFromText(`${cleanTitle} ${cleanNotes}`, pillars),
      urgency: urgencyMap[rawUrg.trim().toLowerCase()] || inferUrgencyFromDue(dueIso, cleanTitle),
      impact: impactMap[rawImp.trim().toLowerCase()] || 'medium',
      estimatedMinutes: rawMin ? Math.max(5, parseInt(rawMin, 10)) : 30,
      createdAt: parsedCreated,
    };
  }

  return {
    cleanTitle,
    cleanNotes,
    pillarId: inferPillarFromText(`${cleanTitle} ${cleanNotes}`, pillars),
    urgency: inferUrgencyFromDue(dueIso, cleanTitle),
    impact: inferImpactFromText(`${cleanTitle} ${cleanNotes}`),
    estimatedMinutes: 30,
    createdAt: defaultCreated,
  };
}

export function inferPillarFromText(text: string, pillars: PriorityPillar[]): string {
  const normalized = text.toLowerCase();
  for (const pillar of pillars) {
    for (const kw of pillar.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        return pillar.id;
      }
    }
  }
  return pillars[0]?.id || 'salud';
}

export function inferUrgencyFromDue(dueIso?: string, text = ''): UrgencyLevel {
  const lower = text.toLowerCase();
  if (lower.includes('urgente') || lower.includes('hoy') || lower.includes('inmediato')) {
    return 'critical';
  }
  if (dueIso) {
    const dueTime = new Date(dueIso).getTime();
    const now = Date.now();
    const diffDays = (dueTime - now) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) return 'critical';
    if (diffDays <= 3) return 'high';
    if (diffDays <= 7) return 'medium';
    return 'low';
  }
  return 'medium';
}

export function inferImpactFromText(text: string): ImpactLevel {
  const lower = text.toLowerCase();
  if (
    lower.includes('importante') ||
    lower.includes('clave') ||
    lower.includes('médico') ||
    lower.includes('salud') ||
    lower.includes('familia') ||
    lower.includes('entrega') ||
    lower.includes('anual')
  ) {
    return 'high';
  }
  if (lower.includes('comprar') || lower.includes('revisar') || lower.includes('opcional')) {
    return 'low';
  }
  return 'medium';
}

export function calculatePriorityScore(
  task: Pick<EnrichedTask, 'pillarId' | 'urgency' | 'impact' | 'due' | 'status'> & {
    createdAt?: string;
    seniorityBonus?: number;
  },
  pillars: PriorityPillar[],
  nowMs = Date.now()
): number {
  if (task.status === 'completed') {
    return 0;
  }
  const pillar = pillars.find((p) => p.id === task.pillarId);
  const weight = pillar ? Math.min(10, Math.max(1, pillar.weight)) : 5;

  // Pillar weight contributes up to 35 points (weight * 3.5)
  const pillarPoints = weight * 3.5;
  const urgencyPoints = URGENCY_POINTS[task.urgency] ?? 12;
  const impactPoints = IMPACT_POINTS[task.impact] ?? 12;
  const agePoints = calculateAgeBonusPoints(task.createdAt, nowMs);
  const seniorityPoints = task.seniorityBonus ?? 0;

  return Math.min(
    100,
    Math.round(pillarPoints + urgencyPoints + impactPoints + agePoints + seniorityPoints)
  );
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
      // Oldest task in the category gets up to +4 seniority points over newer tasks in the same category
      const fifoPoints = count > 1 ? Math.min(4, count - 1 - idx) : 0;
      seniorityMap.set(t.id, fifoPoints);
    });
  }

  const updated = tasks.map((t) => {
    const seniorityBonus = seniorityMap.get(t.id) ?? 0;
    const ageBonusPoints =
      t.status === 'completed' ? 0 : calculateAgeBonusPoints(t.createdAt, nowMs) + seniorityBonus;
    const priorityScore = calculatePriorityScore(
      { ...t, seniorityBonus },
      pillars,
      nowMs
    );
    return {
      ...t,
      ageBonusPoints,
      priorityScore,
    };
  });

  return sortTasksByPriority(updated, pillars);
}
