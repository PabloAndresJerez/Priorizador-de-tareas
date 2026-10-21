import {
  type EnrichedTask,
  type GoogleTaskList,
  type PriorityPillar,
  parseTaskMetadata,
  serializeTaskForGoogle,
  recalculateAllTasks,
} from '../utils/priorityEngine';

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

interface RawGoogleTask {
  id: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;
  position?: string;
  updated?: string;
}

export async function fetchAllGoogleTasks(
  accessToken: string,
  pillars: PriorityPillar[]
): Promise<{ lists: GoogleTaskList[]; tasks: EnrichedTask[] }> {
  const listsRes = await fetch(`${TASKS_API_BASE}/users/@me/lists?maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listsRes.ok) {
    const errText = await listsRes.text();
    if (
      listsRes.status === 403 ||
      errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      errText.includes('insufficientPermissions')
    ) {
      const scopeErr = new Error(
        'Falta activar la casilla de permisos de Google Tasks en la ventana de autorización de Google.'
      ) as Error & { code?: string };
      scopeErr.code = 'SCOPE_INSUFFICIENT';
      throw scopeErr;
    }
    throw new Error(`No se pudieron leer las listas de Google Tasks (código ${listsRes.status}).`);
  }

  const listsData = await listsRes.json();
  const lists: GoogleTaskList[] = (listsData.items || []).map((item: any) => ({
    id: item.id,
    title: item.title || 'Lista sin nombre',
    updated: item.updated,
  }));

  const allTasks: EnrichedTask[] = [];

  await Promise.all(
    lists.map(async (list) => {
      const tasksRes = await fetch(
        `${TASKS_API_BASE}/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!tasksRes.ok) return;
      const tasksData = await tasksRes.json();
      const rawItems: RawGoogleTask[] = tasksData.items || [];

      rawItems.forEach((item, idx) => {
        if (!item.title || !item.title.trim()) return;
        // Preserve original timestamp or order in list so older/earlier items keep priority
        const baseTimeMs = item.updated ? new Date(item.updated).getTime() : Date.now();
        const fallbackCreatedIso = new Date(baseTimeMs + idx * 1000).toISOString();

        const parsed = parseTaskMetadata(
          item.title,
          item.notes,
          pillars,
          item.due,
          fallbackCreatedIso
        );
        const status = item.status === 'completed' ? 'completed' : 'needsAction';

        allTasks.push({
          id: item.id,
          listId: list.id,
          listTitle: list.title,
          title: item.title,
          cleanTitle: parsed.cleanTitle,
          notes: item.notes || '',
          cleanNotes: parsed.cleanNotes,
          status,
          due: item.due,
          createdAt: parsed.createdAt,
          position: item.position,
          pillarId: parsed.pillarId,
          urgency: parsed.urgency,
          impact: parsed.impact,
          estimatedMinutes: parsed.estimatedMinutes,
          ageBonusPoints: 0,
          priorityScore: 0,
          isDirty: false,
        });
      });
    })
  );

  return {
    lists,
    tasks: recalculateAllTasks(allTasks, pillars),
  };
}

export async function createTaskInGoogle(
  accessToken: string,
  listId: string,
  task: Pick<
    EnrichedTask,
    'cleanTitle' | 'cleanNotes' | 'pillarId' | 'urgency' | 'impact' | 'estimatedMinutes' | 'due'
  > & { createdAt?: string },
  pillars: PriorityPillar[],
  includeTitlePrefix = true
): Promise<RawGoogleTask> {
  const serialized = serializeTaskForGoogle(task, pillars, includeTitlePrefix);
  const body: Record<string, any> = {
    title: serialized.title,
    notes: serialized.notes,
  };
  if (task.due) {
    body.due = new Date(task.due).toISOString();
  }

  const res = await fetch(`${TASKS_API_BASE}/lists/${encodeURIComponent(listId)}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`No se pudo crear la tarea en Google Tasks (${res.status}).`);
  }
  return res.json();
}

export async function updateTaskInGoogle(
  accessToken: string,
  listId: string,
  taskId: string,
  task: Pick<
    EnrichedTask,
    'cleanTitle' | 'cleanNotes' | 'pillarId' | 'urgency' | 'impact' | 'estimatedMinutes' | 'status' | 'due'
  > & { createdAt?: string },
  pillars: PriorityPillar[],
  includeTitlePrefix = true
): Promise<RawGoogleTask> {
  const serialized = serializeTaskForGoogle(task, pillars, includeTitlePrefix);
  const body: Record<string, any> = {
    id: taskId,
    title: serialized.title,
    notes: serialized.notes,
    status: task.status,
  };
  if (task.due) {
    body.due = new Date(task.due).toISOString();
  }

  const res = await fetch(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`No se pudo actualizar la tarea en Google Tasks (${res.status}).`);
  }
  return res.json();
}

export async function deleteTaskFromGoogle(
  accessToken: string,
  listId: string,
  taskId: string
): Promise<void> {
  const res = await fetch(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`No se pudo eliminar la tarea de Google Tasks (${res.status}).`);
  }
}

export async function syncPrioritizedListOrderInGoogle(
  accessToken: string,
  listId: string,
  orderedTasksForList: EnrichedTask[],
  pillars: PriorityPillar[],
  includeTitlePrefix = true
): Promise<void> {
  // First PATCH metadata/titles so priority tags and creation date are reflected in Google Tasks
  for (const task of orderedTasksForList) {
    await updateTaskInGoogle(accessToken, listId, task.id, task, pillars, includeTitlePrefix);
  }

  // Then call Google Tasks move endpoint sequentially from first to last so the exact order is reflected in Google Tasks
  let previousTaskId: string | null = null;
  for (const task of orderedTasksForList) {
    const query = previousTaskId ? `?previous=${encodeURIComponent(previousTaskId)}` : '';
    const moveRes = await fetch(
      `${TASKS_API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(task.id)}/move${query}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!moveRes.ok) {
      console.warn(`Aviso al reordenar tarea ${task.id}: ${moveRes.status}`);
    }
    previousTaskId = task.id;
  }
}

export const DEMO_TASK_LISTS: GoogleTaskList[] = [
  { id: 'list-personal', title: 'Mis Tareas Personales' },
  { id: 'list-hogar', title: 'Hogar y Familia' },
  { id: 'list-profesional', title: 'Trabajo y Proyectos' },
];

export function createInitialDemoTasks(pillars: PriorityPillar[]): EnrichedTask[] {
  const rawDemo: Array<{
    id: string;
    listId: string;
    listTitle: string;
    cleanTitle: string;
    cleanNotes: string;
    pillarId: string;
    urgency: EnrichedTask['urgency'];
    impact: EnrichedTask['impact'];
    estimatedMinutes: number;
    dueOffsetDays: number;
    createdDaysAgo: number;
    status?: 'needsAction' | 'completed';
  }> = [
    {
      id: 'demo-1',
      listId: 'list-personal',
      listTitle: 'Mis Tareas Personales',
      cleanTitle: 'Agendar chequeo médico anual y análisis de sangre',
      cleanNotes: 'Ayuno de 12 horas requerido. Clínica Central.',
      pillarId: 'salud',
      urgency: 'high',
      impact: 'high',
      estimatedMinutes: 25,
      dueOffsetDays: 1,
      createdDaysAgo: 10, // Cargada hace 10 días (se prioriza primero en Salud)
    },
    {
      id: 'demo-2',
      listId: 'list-hogar',
      listTitle: 'Hogar y Familia',
      cleanTitle: 'Reunión con la maestra en el colegio de los chicos',
      cleanNotes: 'Llevar libreta firmada y consultar por campamento.',
      pillarId: 'familia',
      urgency: 'high',
      impact: 'high',
      estimatedMinutes: 40,
      dueOffsetDays: 2,
      createdDaysAgo: 8, // Cargada hace 8 días (más antigua en Familia, se prioriza antes que la cena)
    },
    {
      id: 'demo-3',
      listId: 'list-personal',
      listTitle: 'Mis Tareas Personales',
      cleanTitle: 'Sesión de entrenamiento funcional y elongación (45 min)',
      cleanNotes: 'Priorizar movilidad de espalda y zona media.',
      pillarId: 'salud',
      urgency: 'high',
      impact: 'high',
      estimatedMinutes: 45,
      dueOffsetDays: 1,
      createdDaysAgo: 2, // Cargada hace 2 días (misma urgencia/impacto que demo-1, pero más reciente)
    },
    {
      id: 'demo-4',
      listId: 'list-profesional',
      listTitle: 'Trabajo y Proyectos',
      cleanTitle: 'Entregar propuesta de arquitectura trimestral al cliente',
      cleanNotes: 'Incluir cronograma de hitos y presupuesto revisado.',
      pillarId: 'trabajo',
      urgency: 'critical',
      impact: 'high',
      estimatedMinutes: 90,
      dueOffsetDays: 1,
      createdDaysAgo: 7,
    },
    {
      id: 'demo-5',
      listId: 'list-hogar',
      listTitle: 'Hogar y Familia',
      cleanTitle: 'Organizar cena familiar del domingo y comprar ingredientes',
      cleanNotes: 'Confirmar asistencia de los abuelos y menú sin TACC.',
      pillarId: 'familia',
      urgency: 'high',
      impact: 'high',
      estimatedMinutes: 60,
      dueOffsetDays: 3,
      createdDaysAgo: 1, // Cargada hace 1 día en Familia
    },
    {
      id: 'demo-6',
      listId: 'list-personal',
      listTitle: 'Mis Tareas Personales',
      cleanTitle: 'Conciliar gastos mensuales y pagar tarjeta antes del vencimiento',
      cleanNotes: 'Verificar débitos automáticos de servicios.',
      pillarId: 'finanzas',
      urgency: 'high',
      impact: 'medium',
      estimatedMinutes: 30,
      dueOffsetDays: 2,
      createdDaysAgo: 6,
    },
    {
      id: 'demo-7',
      listId: 'list-profesional',
      listTitle: 'Trabajo y Proyectos',
      cleanTitle: 'Preparar retrospectiva de equipo y limpiar backlog',
      cleanNotes: 'Agrupar tickets técnicos pendientes para la próxima semana.',
      pillarId: 'trabajo',
      urgency: 'medium',
      impact: 'medium',
      estimatedMinutes: 35,
      dueOffsetDays: 4,
      createdDaysAgo: 4,
    },
    {
      id: 'demo-8',
      listId: 'list-personal',
      listTitle: 'Mis Tareas Personales',
      cleanTitle: 'Completar módulo 3 del curso de diseño de sistemas',
      cleanNotes: 'Tomar notas sobre patrones de resiliencia.',
      pillarId: 'crecimiento',
      urgency: 'medium',
      impact: 'high',
      estimatedMinutes: 50,
      dueOffsetDays: 5,
      createdDaysAgo: 9,
    },
    {
      id: 'demo-9',
      listId: 'list-hogar',
      listTitle: 'Hogar y Familia',
      cleanTitle: 'Reservar entradas de teatro y paseo de sábado por la tarde',
      cleanNotes: 'Buscar función de las 20:30 en el centro.',
      pillarId: 'ocio',
      urgency: 'low',
      impact: 'medium',
      estimatedMinutes: 20,
      dueOffsetDays: 6,
      createdDaysAgo: 5,
    },
    {
      id: 'demo-10',
      listId: 'list-personal',
      listTitle: 'Mis Tareas Personales',
      cleanTitle: 'Renovar receta de lentes de descanso en la óptica',
      cleanNotes: 'Retirar por sucursal centro.',
      pillarId: 'salud',
      urgency: 'low',
      impact: 'low',
      estimatedMinutes: 20,
      dueOffsetDays: 7,
      createdDaysAgo: 12,
      status: 'completed',
    },
  ];

  const now = Date.now();
  const enriched: EnrichedTask[] = rawDemo.map((item) => {
    const dueDate = new Date(now + item.dueOffsetDays * 24 * 60 * 60 * 1000);
    const createdDate = new Date(now - item.createdDaysAgo * 24 * 60 * 60 * 1000);
    const dueIso = dueDate.toISOString();
    const createdIso = createdDate.toISOString();
    const status = item.status || 'needsAction';
    const serialized = serializeTaskForGoogle(
      { ...item, createdAt: createdIso },
      pillars,
      true
    );

    return {
      id: item.id,
      listId: item.listId,
      listTitle: item.listTitle,
      title: serialized.title,
      cleanTitle: item.cleanTitle,
      notes: serialized.notes,
      cleanNotes: item.cleanNotes,
      status,
      due: dueIso,
      createdAt: createdIso,
      pillarId: item.pillarId,
      urgency: item.urgency,
      impact: item.impact,
      estimatedMinutes: item.estimatedMinutes,
      ageBonusPoints: 0,
      priorityScore: 0,
      isDirty: false,
    };
  });

  return recalculateAllTasks(enriched, pillars, now);
}
