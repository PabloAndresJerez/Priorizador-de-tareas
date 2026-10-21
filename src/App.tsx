/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  DEFAULT_PILLARS,
  type EnrichedTask,
  type GoogleTaskList,
  type ImpactLevel,
  type PriorityPillar,
  type UrgencyLevel,
  calculatePriorityScore,
  compareTasksByPriorityAndAge,
  recalculateAllTasks,
  serializeTaskForGoogle,
} from './utils/priorityEngine';
import { type QuickAddDraft } from './utils/quickAddParser';
import { formatMinutes, ymdToGoogleDue } from './utils/dates';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/authService';
import {
  DEMO_TASK_LISTS,
  createInitialDemoTasks,
  createTaskInGoogle,
  deleteTaskFromGoogle,
  fetchAllGoogleTasks,
  syncPrioritizedListOrderInGoogle,
  updateTaskInGoogle,
} from './services/googleTasksService';
import {
  ConfirmSyncModal,
  type PendingConfirmationAction,
} from './components/ConfirmSyncModal';
import { PillarConfigModal } from './components/PillarConfigModal';
import { TaskEditorModal } from './components/TaskEditorModal';
import { SmartQuickAdd } from './components/SmartQuickAdd';
import { IMPACT_LABELS, URGENCY_LABELS } from './components/taskUi';
import { FocusView } from './components/views/FocusView';
import { MatrixView } from './components/views/MatrixView';
import { BoardView } from './components/views/BoardView';
import { ListsView } from './components/views/ListsView';
import { PillarsView } from './components/views/PillarsView';

type WorkspaceView = 'focus' | 'matrix' | 'board' | 'lists' | 'pillars';

const VIEWS: Array<{ id: WorkspaceView; label: string; short: string }> = [
  { id: 'focus', label: 'Hoy', short: 'Hoy' },
  { id: 'matrix', label: 'Mapa de prioridades', short: 'Mapa' },
  { id: 'board', label: 'Tablero por áreas', short: 'Tablero' },
  { id: 'lists', label: 'Listas de Google Tasks', short: 'Listas' },
  { id: 'pillars', label: 'Áreas de vida', short: 'Áreas' },
];

function readStored<T>(key: string, fallback: T, validate: (value: unknown) => boolean): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (validate(parsed)) return parsed as T;
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  // Priority Pillars state (persisted in localStorage for user convenience)
  const [pillars, setPillars] = useState<PriorityPillar[]>(() =>
    readStored('orden_prioridades_pillars_v1', DEFAULT_PILLARS, (v) => Array.isArray(v) && v.length > 0)
  );

  // Google Auth state
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hasTasksScope, setHasTasksScope] = useState<boolean>(false);
  const [scopeMissingError, setScopeMissingError] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Tasks & TaskLists state
  const [lists, setLists] = useState<GoogleTaskList[]>(DEMO_TASK_LISTS);
  const [tasks, setTasks] = useState<EnrichedTask[]>(() =>
    createInitialDemoTasks(DEFAULT_PILLARS)
  );
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Navigation & Filters
  const [activeView, setActiveView] = useState<WorkspaceView>(() =>
    readStored<WorkspaceView>('orden_prioridades_view_v2', 'focus', (v) => VIEWS.some((view) => view.id === v))
  );
  const [budgetMinutes, setBudgetMinutes] = useState<number>(() =>
    readStored('orden_prioridades_budget_v2', 120, (v) => typeof v === 'number' && v > 0)
  );
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');
  const [selectedPillarFilter, setSelectedPillarFilter] = useState<string>('all');
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [includeTitlePrefixOnSync, setIncludeTitlePrefixOnSync] = useState<boolean>(true);

  // Modals
  const [isPillarModalOpen, setIsPillarModalOpen] = useState(false);
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EnrichedTask | null>(null);
  const [editorDefaultPillarId, setEditorDefaultPillarId] = useState<string | undefined>(undefined);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmationAction | null>(null);
  const [isProcessingConfirm, setIsProcessingConfirm] = useState(false);

  const isConnectedToGoogle = Boolean(user && token && hasTasksScope && !scopeMissingError);

  useEffect(() => writeStored('orden_prioridades_view_v2', activeView), [activeView]);
  useEffect(() => writeStored('orden_prioridades_budget_v2', budgetMinutes), [budgetMinutes]);

  // Urgency depends on today's date: re-score every 10 minutes so a page left open stays correct.
  useEffect(() => {
    const id = window.setInterval(() => setTasks((prev) => recalculateAllTasks(prev, pillars)), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [pillars]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authUser, accessToken) => {
        setUser(authUser);
        setToken(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setHasTasksScope(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const loadTasksFromGoogle = async (accessToken: string, currentPillars = pillars) => {
    setIsLoadingTasks(true);
    setErrorBanner(null);
    try {
      const result = await fetchAllGoogleTasks(accessToken, currentPillars);
      setScopeMissingError(false);
      setHasTasksScope(true);
      if (result.lists.length > 0) {
        setLists(result.lists);
        setTasks(result.tasks);
        setStatusBanner(
          `¡Sincronización exitosa! Se cargaron ${result.tasks.length} tareas reales desde ${result.lists.length} listas de tu Google Tasks.`
        );
      } else {
        setLists([]);
        setTasks([]);
        setStatusBanner('Tu cuenta de Google Tasks está conectada, pero no tiene listas creadas todavía.');
      }
    } catch (err: any) {
      console.error('Error al cargar Google Tasks:', err);
      if (err?.code === 'SCOPE_INSUFFICIENT') {
        setScopeMissingError(true);
        setHasTasksScope(false);
        setErrorBanner(null);
      } else {
        setErrorBanner(
          err?.message || 'No se pudieron leer las listas de Google Tasks. Verifica tu sesión.'
        );
      }
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setErrorBanner(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        if (!result.hasTasksScope) {
          setScopeMissingError(true);
          setHasTasksScope(false);
          return;
        }
        setScopeMissingError(false);
        setHasTasksScope(true);
        await loadTasksFromGoogle(result.accessToken, pillars);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setErrorBanner(
        'No se completó el inicio de sesión con Google. Puedes seguir organizando en el entorno interactivo o volver a intentarlo.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setHasTasksScope(false);
    setScopeMissingError(false);
    setLists(DEMO_TASK_LISTS);
    setTasks(createInitialDemoTasks(pillars));
    setStatusBanner('Sesión de Google cerrada. Mostrando espacio de demostración.');
  };

  const handleSavePillars = (updatedPillars: PriorityPillar[]) => {
    setPillars(updatedPillars);
    writeStored('orden_prioridades_pillars_v1', updatedPillars);
    setTasks((prev) => recalculateAllTasks(prev, updatedPillars));
    setStatusBanner(
      'Dimensiones de prioridad actualizadas. Todas las tareas fueron reordenadas según tus nuevos pesos.'
    );
  };

  const handleInlineWeightChange = (pillarId: string, newWeight: number) => {
    const updated = pillars.map((p) => (p.id === pillarId ? { ...p, weight: newWeight } : p));
    setPillars(updated);
    writeStored('orden_prioridades_pillars_v1', updated);
    setTasks((prev) => recalculateAllTasks(prev, updated));
  };

  // Every change to the real Google account is confirmed first. In demo mode nothing leaves the
  // browser, so non-destructive actions run straight away instead of interrupting with a dialog.
  const requestConfirmation = (action: PendingConfirmationAction) => {
    if (!isConnectedToGoogle && !action.isDestructive) {
      void action.onConfirm();
      return;
    }
    setPendingConfirmation(action);
  };

  // Filtered and sorted tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!showCompleted && t.status === 'completed') return false;
      if (selectedListFilter !== 'all' && t.listId !== selectedListFilter) return false;
      if (selectedPillarFilter !== 'all' && t.pillarId !== selectedPillarFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.cleanTitle.toLowerCase().includes(q);
        const matchNotes = t.cleanNotes.toLowerCase().includes(q);
        const matchList = t.listTitle.toLowerCase().includes(q);
        if (!matchTitle && !matchNotes && !matchList) return false;
      }
      return true;
    });
  }, [tasks, showCompleted, selectedListFilter, selectedPillarFilter, searchQuery]);

  // Metrics & Life Balance stats
  const activeTasks = useMemo(() => tasks.filter((t) => t.status === 'needsAction'), [tasks]);
  const dirtyTasksCount = useMemo(() => tasks.filter((t) => t.isDirty).length, [tasks]);

  const pillarDistribution = useMemo(() => {
    const total = Math.max(1, activeTasks.length);
    return pillars.map((p) => {
      const count = activeTasks.filter((t) => t.pillarId === p.id).length;
      const minutes = activeTasks
        .filter((t) => t.pillarId === p.id)
        .reduce((acc, item) => acc + item.estimatedMinutes, 0);
      return {
        ...p,
        count,
        minutes,
        percentage: Math.round((count / total) * 100),
      };
    });
  }, [pillars, activeTasks]);

  // Task mutation handlers (with mandatory confirmation dialog before mutating Google Tasks)
  const handleSmartQuickAdd = (draft: QuickAddDraft, listId: string) => {
    const targetList = lists.find((l) => l.id === listId) || lists[0] || DEMO_TASK_LISTS[0];
    const targetPillar = pillars.find((p) => p.id === draft.pillarId) || pillars[0] || DEFAULT_PILLARS[0];
    const due = draft.dueYmd ? ymdToGoogleDue(draft.dueYmd) : undefined;
    setErrorBanner(null);

    const create = async () => {
      setIsProcessingConfirm(true);
      try {
        const nowIso = new Date().toISOString();
        const newTaskDraft = {
          cleanTitle: draft.title,
          cleanNotes: '',
          pillarId: targetPillar.id,
          urgency: draft.urgency,
          impact: draft.impact,
          estimatedMinutes: draft.estimatedMinutes,
          due,
          createdAt: nowIso,
        };

        let createdId = `task-${Date.now()}`;
        const activeToken = await getAccessToken();
        if (activeToken && isConnectedToGoogle) {
          const createdRemote = await createTaskInGoogle(
            activeToken,
            targetList.id,
            newTaskDraft,
            pillars,
            includeTitlePrefixOnSync
          );
          if (createdRemote.id) createdId = createdRemote.id;
        }

        const serialized = serializeTaskForGoogle(newTaskDraft, pillars, includeTitlePrefixOnSync);
        const newEnriched: EnrichedTask = {
          ...newTaskDraft,
          id: createdId,
          listId: targetList.id,
          listTitle: targetList.title,
          title: serialized.title,
          notes: serialized.notes,
          status: 'needsAction',
          ageBonusPoints: 0,
          priorityScore: 0,
          isDirty: false,
        };

        setTasks((prev) => recalculateAllTasks([newEnriched, ...prev], pillars));
        setStatusBanner(`Tarea "${draft.title}" añadida en ${targetPillar.name}.`);
        setPendingConfirmation(null);
      } catch (err: any) {
        setErrorBanner(err?.message || 'Error al crear la tarea.');
      } finally {
        setIsProcessingConfirm(false);
      }
    };

    requestConfirmation({
      title: 'Confirmar creación de tarea en Google Tasks',
      description: `Se creará la tarea en la lista "${targetList.title}".`,
      affectedItems: [
        `[${targetPillar.name}] ${draft.title} · ${URGENCY_LABELS[draft.urgency]} · ${formatMinutes(draft.estimatedMinutes)}`,
      ],
      confirmLabel: 'Confirmar y crear tarea',
      onConfirm: create,
    });
  };

  const handleSaveTaskFromModal = (taskData: {
    id?: string;
    listId: string;
    cleanTitle: string;
    cleanNotes: string;
    pillarId: string;
    urgency: UrgencyLevel;
    impact: ImpactLevel;
    estimatedMinutes: number;
    due?: string;
    createdAt?: string;
  }) => {
    const targetList = lists.find((l) => l.id === taskData.listId) || lists[0] || DEMO_TASK_LISTS[0];
    const targetPillar = pillars.find((p) => p.id === taskData.pillarId) || pillars[0];
    const isEditing = Boolean(taskData.id);

    setIsTaskEditorOpen(false);
    requestConfirmation({
      title: isEditing
        ? 'Confirmar actualización de tarea en Google Tasks'
        : 'Confirmar nueva tarea en Google Tasks',
      description: isEditing
        ? `Se actualizará la tarea "${taskData.cleanTitle}" con prioridad "${targetPillar?.name}" en la lista "${targetList.title}".`
        : `Se agregará la tarea "${taskData.cleanTitle}" en la lista "${targetList.title}".`,
      affectedItems: [
        `${taskData.cleanTitle} → ${targetPillar?.name} · ${URGENCY_LABELS[taskData.urgency]} · ${IMPACT_LABELS[taskData.impact]}`,
      ],
      confirmLabel: isEditing ? 'Confirmar cambios' : 'Confirmar y crear',
      onConfirm: async () => {
        setIsProcessingConfirm(true);
        try {
          const activeToken = await getAccessToken();
          const resolvedCreatedAt = taskData.createdAt || new Date().toISOString();
          const serialized = serializeTaskForGoogle(
            { ...taskData, createdAt: resolvedCreatedAt },
            pillars,
            includeTitlePrefixOnSync
          );
          const priorityScore = calculatePriorityScore(
            {
              pillarId: taskData.pillarId,
              urgency: taskData.urgency,
              impact: taskData.impact,
              due: taskData.due,
              createdAt: resolvedCreatedAt,
              status: 'needsAction',
            },
            pillars
          );

          if (isEditing && taskData.id) {
            if (activeToken && isConnectedToGoogle) {
              await updateTaskInGoogle(
                activeToken,
                taskData.listId,
                taskData.id,
                { ...taskData, createdAt: resolvedCreatedAt, status: 'needsAction' },
                pillars,
                includeTitlePrefixOnSync
              );
            }
            setTasks((prev) =>
              recalculateAllTasks(
                prev.map((t) =>
                  t.id === taskData.id
                    ? {
                        ...t,
                        listId: targetList.id,
                        listTitle: targetList.title,
                        title: serialized.title,
                        cleanTitle: taskData.cleanTitle,
                        notes: serialized.notes,
                        cleanNotes: taskData.cleanNotes,
                        pillarId: taskData.pillarId,
                        urgency: taskData.urgency,
                        impact: taskData.impact,
                        estimatedMinutes: taskData.estimatedMinutes,
                        due: taskData.due,
                        createdAt: resolvedCreatedAt,
                        priorityScore,
                        isDirty: false,
                      }
                    : t
                ),
                pillars
              )
            );
            setStatusBanner(`Tarea "${taskData.cleanTitle}" actualizada correctamente.`);
          } else {
            let newId = `task-${Date.now()}`;
            if (activeToken && isConnectedToGoogle) {
              const created = await createTaskInGoogle(
                activeToken,
                targetList.id,
                { ...taskData, createdAt: resolvedCreatedAt },
                pillars,
                includeTitlePrefixOnSync
              );
              if (created.id) newId = created.id;
            }
            const newTask: EnrichedTask = {
              id: newId,
              listId: targetList.id,
              listTitle: targetList.title,
              title: serialized.title,
              cleanTitle: taskData.cleanTitle,
              notes: serialized.notes,
              cleanNotes: taskData.cleanNotes,
              status: 'needsAction',
              due: taskData.due,
              createdAt: resolvedCreatedAt,
              pillarId: taskData.pillarId,
              urgency: taskData.urgency,
              impact: taskData.impact,
              estimatedMinutes: taskData.estimatedMinutes,
              ageBonusPoints: 0,
              priorityScore,
              isDirty: false,
            };
            setTasks((prev) => recalculateAllTasks([newTask, ...prev], pillars));
            setStatusBanner(`Tarea "${taskData.cleanTitle}" creada y priorizada.`);
          }
          setPendingConfirmation(null);
        } catch (err: any) {
          setErrorBanner(err?.message || 'Error al guardar la tarea.');
        } finally {
          setIsProcessingConfirm(false);
        }
      },
    });
  };

  const handleChangeTaskPillar = (taskId: string, newPillarId: string) => {
    setTasks((prev) =>
      recalculateAllTasks(
        prev.map((t) =>
          t.id === taskId ? { ...t, pillarId: newPillarId, isDirty: true } : t
        ),
        pillars
      )
    );
  };

  const handleCycleTaskUrgency = (taskId: string) => {
    const order: UrgencyLevel[] = ['low', 'medium', 'high', 'critical'];
    setTasks((prev) =>
      recalculateAllTasks(
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const nextUrgency = order[(order.indexOf(t.urgency) + 1) % order.length];
          return { ...t, urgency: nextUrgency, isDirty: true };
        }),
        pillars
      )
    );
  };

  const handleToggleTaskStatus = (task: EnrichedTask) => {
    const nextStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    requestConfirmation({
      title:
        nextStatus === 'completed'
          ? 'Confirmar tarea completada en Google Tasks'
          : 'Confirmar reapertura de tarea en Google Tasks',
      description:
        nextStatus === 'completed'
          ? `Se marcará como completada la tarea "${task.cleanTitle}" en la lista "${task.listTitle}".`
          : `Se reactivará la tarea "${task.cleanTitle}" en la lista "${task.listTitle}".`,
      affectedItems: [`${task.cleanTitle} (${task.listTitle})`],
      confirmLabel: nextStatus === 'completed' ? 'Marcar como completada' : 'Reactivar tarea',
      onConfirm: async () => {
        setIsProcessingConfirm(true);
        try {
          const activeToken = await getAccessToken();
          if (activeToken && isConnectedToGoogle) {
            await updateTaskInGoogle(
              activeToken,
              task.listId,
              task.id,
              { ...task, status: nextStatus },
              pillars,
              includeTitlePrefixOnSync
            );
          }
          setTasks((prev) =>
            recalculateAllTasks(
              prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, isDirty: false } : t)),
              pillars
            )
          );
          setStatusBanner(
            nextStatus === 'completed'
              ? `¡Bien! "${task.cleanTitle}" completada.`
              : `Tarea "${task.cleanTitle}" marcada como pendiente.`
          );
          setPendingConfirmation(null);
        } catch (err: any) {
          setErrorBanner(err?.message || 'Error al actualizar el estado de la tarea.');
        } finally {
          setIsProcessingConfirm(false);
        }
      },
    });
  };

  const handleDeleteTask = (task: EnrichedTask) => {
    requestConfirmation({
      title: 'Confirmar eliminación de tarea en Google Tasks',
      description: `¿Estás seguro de que deseas eliminar permanentemente "${task.cleanTitle}" de la lista "${task.listTitle}"? Esta acción no se puede deshacer.`,
      affectedItems: [`${task.cleanTitle} — Lista: ${task.listTitle}`],
      confirmLabel: 'Eliminar tarea',
      isDestructive: true,
      onConfirm: async () => {
        setIsProcessingConfirm(true);
        try {
          const activeToken = await getAccessToken();
          if (activeToken && isConnectedToGoogle) {
            await deleteTaskFromGoogle(activeToken, task.listId, task.id);
          }
          setTasks((prev) => prev.filter((t) => t.id !== task.id));
          setStatusBanner(`Tarea "${task.cleanTitle}" eliminada.`);
          setPendingConfirmation(null);
        } catch (err: any) {
          setErrorBanner(err?.message || 'No se pudo eliminar la tarea.');
        } finally {
          setIsProcessingConfirm(false);
        }
      },
    });
  };

  const handleSyncAllToGoogleTasks = (targetListId?: string) => {
    const listsToSync = targetListId
      ? lists.filter((l) => l.id === targetListId)
      : lists;

    const tasksToSync = tasks.filter(
      (t) =>
        t.status === 'needsAction' &&
        (!targetListId || t.listId === targetListId)
    );

    if (tasksToSync.length === 0) {
      setStatusBanner('No hay tareas activas para sincronizar en esta selección.');
      return;
    }

    const previewLines = tasksToSync.slice(0, 12).map((t, idx) => {
      const pName = pillars.find((p) => p.id === t.pillarId)?.name.split(' ')[0] || t.pillarId;
      return `Posición #${idx + 1} (${t.priorityScore} pts): [${pName}] ${t.cleanTitle} — Lista: ${t.listTitle}`;
    });

    requestConfirmation({
      title: 'Confirmar reordenamiento y sincronización en Google Tasks',
      description: `Se actualizarán las etiquetas de prioridad y se reordenarán ${tasksToSync.length} tareas activas en ${listsToSync.length} lista(s) de Google Tasks según tu escala de prioridades.`,
      affectedItems: previewLines,
      confirmLabel: 'Confirmar y reflejar en Google Tasks',
      onConfirm: async () => {
        setIsProcessingConfirm(true);
        try {
          const activeToken = await getAccessToken();
          if (activeToken && isConnectedToGoogle) {
            for (const list of listsToSync) {
              const orderedForList = tasks
                .filter((t) => t.listId === list.id && t.status === 'needsAction')
                .sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars));
              if (orderedForList.length > 0) {
                await syncPrioritizedListOrderInGoogle(
                  activeToken,
                  list.id,
                  orderedForList,
                  pillars,
                  includeTitlePrefixOnSync
                );
              }
            }
          }

          setTasks((prev) =>
            recalculateAllTasks(
              prev.map((t) => {
                if (targetListId && t.listId !== targetListId) return t;
                const serialized = serializeTaskForGoogle(t, pillars, includeTitlePrefixOnSync);
                return {
                  ...t,
                  title: serialized.title,
                  notes: serialized.notes,
                  isDirty: false,
                };
              }),
              pillars
            )
          );

          setStatusBanner(
            isConnectedToGoogle
              ? `¡Orden sincronizado! Se actualizaron y reordenaron ${tasksToSync.length} tareas directamente en tu Google Tasks.`
              : `Orden aplicado a ${tasksToSync.length} tareas. Inicia sesión con Google en la barra superior para reflejar estos cambios en tu cuenta real de Google Tasks.`
          );
          setPendingConfirmation(null);
        } catch (err: any) {
          setErrorBanner(err?.message || 'Error al sincronizar con Google Tasks.');
        } finally {
          setIsProcessingConfirm(false);
        }
      },
    });
  };


  const sortedFilteredTasks = useMemo(
    () => [...filteredTasks].sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars)),
    [filteredTasks, pillars]
  );

  const openEditor = (task: EnrichedTask | null, pillarId?: string) => {
    setEditingTask(task);
    setEditorDefaultPillarId(pillarId);
    setIsTaskEditorOpen(true);
  };

  const taskActions = {
    onToggle: handleToggleTaskStatus,
    onEdit: (task: EnrichedTask) => openEditor(task),
    onDelete: handleDeleteTask,
    onCycleUrgency: handleCycleTaskUrgency,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 sm:gap-8 border-b border-slate-200 bg-white/90 backdrop-blur px-4 sm:px-6 py-3">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('focus');
          }}
          className="flex items-center gap-2 font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">OP</span>
          <span className="hidden sm:inline">Orden de Prioridades</span>
        </a>

        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium text-slate-600">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveView(view.id)}
              aria-current={activeView === view.id ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap ${
                activeView === view.id ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
              }`}
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {!isConnectedToGoogle ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {isLoggingIn ? 'Conectando...' : 'Conectar Google Tasks'}
                </span>
              </div>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => token && loadTasksFromGoogle(token, pillars)}
                disabled={isLoadingTasks}
                aria-label="Recargar desde Google Tasks"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingTasks ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Cerrar sesión de Google"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setActiveView(view.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
              activeView === view.id ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            {view.short}
          </button>
        ))}
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 py-6 space-y-5">
        {scopeMissingError && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-5 text-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <h2 className="font-display text-sm font-bold text-amber-950">
                  Falta marcar la casilla de permiso de Google Tasks en la ventana de Google
                </h2>
                <p className="text-xs text-amber-900 leading-relaxed max-w-3xl">
                  Iniciaste sesión como <strong>{user?.email || 'tu cuenta de Google'}</strong>, pero Google no incluyó el permiso de acceso a tus tareas. En la pantalla de autorización, marcá la casilla <strong>«Crear, editar, organizar y eliminar todas tus tareas»</strong> antes de pulsar <strong>Continuar</strong>.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoggingIn ? 'animate-spin' : ''}`} />
                  <span>{isLoggingIn ? 'Abriendo ventana de Google...' : 'Conceder permiso de Google Tasks'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScopeMissingError(false)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
                >
                  Omitir por ahora
                </button>
              </div>
            </div>
          </div>
        )}

        {statusBanner && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
            <span>{statusBanner}</span>
            <button type="button" onClick={() => setStatusBanner(null)} className="font-medium text-emerald-700 hover:text-emerald-950 whitespace-nowrap shrink-0">
              Cerrar
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            <span>{errorBanner}</span>
            <button type="button" onClick={() => setErrorBanner(null)} className="font-medium text-red-800 hover:underline whitespace-nowrap shrink-0">
              Cerrar
            </button>
          </div>
        )}

        {/* Workspace header: connection status, actions and life-balance filter */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className={`inline-flex items-center gap-1.5 ${isConnectedToGoogle ? 'text-emerald-700' : ''}`}>
                  <span className={`h-2 w-2 rounded-full ${isConnectedToGoogle ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  {isConnectedToGoogle
                    ? `Conectado a Google Tasks (${user?.email})`
                    : scopeMissingError
                      ? `Permiso de Google Tasks pendiente (${user?.email})`
                      : 'Modo demostración · conectá tu cuenta para trabajar con tus tareas reales'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">{lists.length} listas</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">{activeTasks.length} pendientes</span>
              </div>
              <h1 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl" style={{ textWrap: 'balance' }}>
                {activeView === 'focus' ? 'Qué hacer ahora, y por qué' : VIEWS.find((v) => v.id === activeView)?.label}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsPillarModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Áreas y pesos</span>
              </button>
              <button
                type="button"
                onClick={() => openEditor(null)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tarea detallada</span>
              </button>
              <button
                type="button"
                onClick={() => handleSyncAllToGoogleTasks()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span>
                  Aplicar orden en Google Tasks
                  {dirtyTasksCount > 0 ? ` (${dirtyTasksCount})` : ''}
                </span>
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {pillarDistribution.map((p) =>
                p.count > 0 ? (
                  <div
                    key={p.id}
                    style={{ width: `${p.percentage}%`, backgroundColor: p.accentHex }}
                    title={`${p.name}: ${p.count} tareas (${p.percentage}%)`}
                    className="h-full transition-all duration-300"
                  />
                ) : null
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por área">
              {pillarDistribution.map((p) => {
                const isSelected = selectedPillarFilter === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedPillarFilter((prev) => (prev === p.id ? 'all' : p.id))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isSelected ? 'text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                    style={isSelected ? { backgroundColor: p.accentHex, borderColor: p.accentHex } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isSelected ? '#fff' : p.accentHex }} />
                    {p.name.split(' ')[0]}
                    <span className={`font-mono tabular-nums ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{p.count}</span>
                  </button>
                );
              })}
              {selectedPillarFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedPillarFilter('all')}
                  className="rounded-full px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Ver todas
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Smart capture + filters */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto] xl:items-start">
          <SmartQuickAdd
            pillars={pillars}
            lists={lists}
            defaultListId={selectedListFilter !== 'all' ? selectedListFilter : undefined}
            onSubmit={handleSmartQuickAdd}
          />
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Buscar tareas"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-36 rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <select
              aria-label="Filtrar por lista de Google Tasks"
              value={selectedListFilter}
              onChange={(e) => setSelectedListFilter(e.target.value)}
              className="max-w-[12rem] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none"
            >
              <option value="all">Todas las listas ({lists.length})</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowCompleted((prev) => !prev)}
              aria-pressed={showCompleted}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                showCompleted ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {showCompleted ? 'Ocultar completadas' : 'Ver completadas'}
            </button>
          </div>
        </div>

        {activeView === 'focus' && (
          <FocusView
            tasks={sortedFilteredTasks}
            allTasks={tasks}
            pillars={pillars}
            budgetMinutes={budgetMinutes}
            onBudgetChange={setBudgetMinutes}
            onSelectPillar={(id) => {
              setSelectedPillarFilter(id);
              setActiveView('board');
            }}
            {...taskActions}
          />
        )}

        {activeView === 'matrix' && <MatrixView tasks={sortedFilteredTasks} pillars={pillars} {...taskActions} />}

        {activeView === 'board' && (
          <BoardView
            tasks={sortedFilteredTasks}
            pillars={pillars}
            selectedPillarFilter={selectedPillarFilter}
            onMoveToPillar={handleChangeTaskPillar}
            onAddInPillar={(pillarId) => openEditor(null, pillarId)}
            {...taskActions}
          />
        )}

        {activeView === 'lists' && (
          <ListsView
            lists={lists}
            tasks={tasks}
            pillars={pillars}
            showCompleted={showCompleted}
            includeTitlePrefix={includeTitlePrefixOnSync}
            onToggleTitlePrefix={setIncludeTitlePrefixOnSync}
            onSyncList={(listId) => handleSyncAllToGoogleTasks(listId)}
          />
        )}

        {activeView === 'pillars' && (
          <PillarsView
            stats={pillarDistribution}
            onWeightChange={handleInlineWeightChange}
            onOpenConfig={() => setIsPillarModalOpen(true)}
          />
        )}
      </main>

      <PillarConfigModal
        isOpen={isPillarModalOpen}
        pillars={pillars}
        onClose={() => setIsPillarModalOpen(false)}
        onSavePillars={handleSavePillars}
      />

      <TaskEditorModal
        isOpen={isTaskEditorOpen}
        initialTask={editingTask}
        lists={lists}
        pillars={pillars}
        defaultPillarId={editorDefaultPillarId}
        defaultListId={selectedListFilter !== 'all' ? selectedListFilter : undefined}
        onClose={() => {
          setIsTaskEditorOpen(false);
          setEditingTask(null);
        }}
        onSaveTask={handleSaveTaskFromModal}
      />

      <ConfirmSyncModal
        action={pendingConfirmation}
        isProcessing={isProcessingConfirm}
        isConnectedToGoogle={isConnectedToGoogle}
        onCancel={() => setPendingConfirmation(null)}
      />
    </div>
  );
}
