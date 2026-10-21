/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  Circle,
  Edit3,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
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
  getTaskAgeDays,
  recalculateAllTasks,
  serializeTaskForGoogle,
} from './utils/priorityEngine';
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

type WorkspaceView = 'board' | 'matrix' | 'lists' | 'pillars';

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  critical: 'Urgencia Crítica',
  high: 'Urgencia Alta',
  medium: 'Urgencia Media',
  low: 'Urgencia Baja',
};

const IMPACT_LABELS: Record<ImpactLevel, string> = {
  high: 'Impacto Alto',
  medium: 'Impacto Medio',
  low: 'Impacto Bajo',
};

export default function App() {
  // Priority Pillars state (persisted in localStorage for user convenience)
  const [pillars, setPillars] = useState<PriorityPillar[]>(() => {
    try {
      const saved = localStorage.getItem('orden_prioridades_pillars_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PILLARS;
  });

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
  const [activeView, setActiveView] = useState<WorkspaceView>('board');
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');
  const [selectedPillarFilter, setSelectedPillarFilter] = useState<string>('all');
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [includeTitlePrefixOnSync, setIncludeTitlePrefixOnSync] = useState<boolean>(true);

  // Quick Add Task inline bar
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPillarId, setQuickPillarId] = useState(pillars[0]?.id || 'salud');
  const [quickUrgency, setQuickUrgency] = useState<UrgencyLevel>('high');

  // Modals
  const [isPillarModalOpen, setIsPillarModalOpen] = useState(false);
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EnrichedTask | null>(null);
  const [editorDefaultPillarId, setEditorDefaultPillarId] = useState<string | undefined>(undefined);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmationAction | null>(null);
  const [isProcessingConfirm, setIsProcessingConfirm] = useState(false);

  const isConnectedToGoogle = Boolean(user && token && hasTasksScope && !scopeMissingError);

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
    try {
      localStorage.setItem('orden_prioridades_pillars_v1', JSON.stringify(updatedPillars));
    } catch {
      // ignore storage errors
    }
    setTasks((prev) => recalculateAllTasks(prev, updatedPillars));
    setStatusBanner(
      'Dimensiones de prioridad actualizadas. Todas las tareas fueron reordenadas según tus nuevos pesos.'
    );
  };

  const handleInlineWeightChange = (pillarId: string, newWeight: number) => {
    const updated = pillars.map((p) => (p.id === pillarId ? { ...p, weight: newWeight } : p));
    setPillars(updated);
    try {
      localStorage.setItem('orden_prioridades_pillars_v1', JSON.stringify(updated));
    } catch {
      // ignore
    }
    setTasks((prev) => recalculateAllTasks(prev, updated));
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
  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) {
      setErrorBanner('Escribe un título para crear la tarea.');
      return;
    }
    setErrorBanner(null);

    const targetList =
      lists.find((l) => l.id === selectedListFilter) || lists[0] || DEMO_TASK_LISTS[0];
    const targetPillar =
      pillars.find((p) => p.id === quickPillarId) || pillars[0] || DEFAULT_PILLARS[0];

    setPendingConfirmation({
      title: 'Confirmar creación de tarea en Google Tasks',
      description: `Se creará la tarea priorizada bajo "${targetPillar.name}" en la lista "${targetList.title}".`,
      affectedItems: [`[${targetPillar.name}] ${trimmed} (${URGENCY_LABELS[quickUrgency]})`],
      confirmLabel: 'Confirmar y crear tarea',
      onConfirm: async () => {
        setIsProcessingConfirm(true);
        try {
          const nowIso = new Date().toISOString();
          const newTaskDraft = {
            cleanTitle: trimmed,
            cleanNotes: '',
            pillarId: targetPillar.id,
            urgency: quickUrgency,
            impact: 'high' as ImpactLevel,
            estimatedMinutes: 30,
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

          const serialized = serializeTaskForGoogle(
            newTaskDraft,
            pillars,
            includeTitlePrefixOnSync
          );

          const newEnriched: EnrichedTask = {
            id: createdId,
            listId: targetList.id,
            listTitle: targetList.title,
            title: serialized.title,
            cleanTitle: trimmed,
            notes: serialized.notes,
            cleanNotes: '',
            status: 'needsAction',
            createdAt: nowIso,
            pillarId: targetPillar.id,
            urgency: quickUrgency,
            impact: 'high',
            estimatedMinutes: 30,
            ageBonusPoints: 0,
            priorityScore: 0,
            isDirty: false,
          };

          setTasks((prev) => recalculateAllTasks([newEnriched, ...prev], pillars));
          setQuickTitle('');
          setStatusBanner(`Tarea "${trimmed}" añadida y priorizada con éxito.`);
          setPendingConfirmation(null);
        } catch (err: any) {
          setErrorBanner(err?.message || 'Error al crear la tarea.');
        } finally {
          setIsProcessingConfirm(false);
        }
      },
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
    setPendingConfirmation({
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
    setPendingConfirmation({
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
              ? `Tarea "${task.cleanTitle}" completada.`
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
    setPendingConfirmation({
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

    setPendingConfirmation({
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

  const formatDueDate = (dueIso?: string) => {
    if (!dueIso) return 'Sin fecha límite';
    try {
      const date = new Date(dueIso);
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } catch {
      return 'Sin fecha';
    }
  };

  const formatTaskAge = (task: EnrichedTask) => {
    const days = getTaskAgeDays(task.createdAt);
    const bonusText = task.ageBonusPoints > 0 ? ` (+${task.ageBonusPoints} pts antigüedad)` : '';
    if (days <= 0) return `Cargada hoy${bonusText}`;
    if (days === 1) return `Cargada hace 1d${bonusText}`;
    return `Cargada hace ${days}d${bonusText}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 on desktop */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 sm:gap-8 border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('board');
          }}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Orden de Prioridades
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveView('board')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'board'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Tablero de Prioridades
          </button>
          <button
            type="button"
            onClick={() => setActiveView('matrix')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'matrix'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Matriz y Cola Maestra
          </button>
          <button
            type="button"
            onClick={() => setActiveView('lists')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'lists'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Listas de Google Tasks
          </button>
          <button
            type="button"
            onClick={() => setActiveView('pillars')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'pillars'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Dimensiones de Vida
          </button>
        </nav>

        {/* Zone 3: Primary action (Official Sign in with Google button or Sync action when connected) */}
        <div className="flex items-center gap-3 shrink-0">
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
                  {isLoggingIn ? 'Conectando...' : 'Sign in with Google'}
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSyncAllToGoogleTasks()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reflejar orden en Google Tasks</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
        <button
          type="button"
          onClick={() => setActiveView('board')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
            activeView === 'board' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Tablero
        </button>
        <button
          type="button"
          onClick={() => setActiveView('matrix')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
            activeView === 'matrix' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Matriz y Cola
        </button>
        <button
          type="button"
          onClick={() => setActiveView('lists')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
            activeView === 'lists' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Listas Google
        </button>
        <button
          type="button"
          onClick={() => setActiveView('pillars')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
            activeView === 'pillars' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Dimensiones
        </button>
      </div>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* Guided Banner when user signed in with Google but did not check the Google Tasks scope box */}
        {scopeMissingError && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-5 text-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <h2 className="font-display text-sm font-bold text-amber-950">
                  Falta marcar la casilla de permiso de Google Tasks en la ventana de Google
                </h2>
                <p className="text-xs text-amber-900 leading-relaxed max-w-3xl">
                  Iniciaste sesión como <strong>{user?.email || 'tu cuenta de Google'}</strong>, pero Google no incluyó el permiso de acceso a tus tareas (Error 403: <em>Insufficient Permission</em>). En la pantalla de autorización de Google, asegúrate de <strong>marcar la casilla «Crear, editar, organizar y eliminar todas tus tareas»</strong> antes de pulsar <strong>Continuar</strong>.
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
                  <span>
                    {isLoggingIn
                      ? 'Abriendo ventana de Google...'
                      : 'Conceder permiso de Google Tasks'}
                  </span>
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

        {/* Notifications / Status Banners */}
        {statusBanner && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="font-medium text-red-800 hover:underline whitespace-nowrap shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Executive Workspace Header & Life-Balance Bar */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>
                  {isConnectedToGoogle
                    ? `Conectado a Google Tasks (${user?.email})`
                    : scopeMissingError
                      ? `Permiso de Google Tasks pendiente (${user?.email}) · Marca la casilla al autorizar`
                      : 'Modo interactivo de demostración · Conecta tu cuenta para sincronizar en vivo'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">{lists.length} listas</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">{activeTasks.length} tareas activas</span>
              </div>
              <h1
                className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
                style={{ textWrap: 'balance' }}
              >
                Priorización inteligente basada en tus dimensiones de vida
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                Ordena tus listas de Google Tasks cruzando la importancia de cada área vital (Salud, Familia, Trabajo, Ocio) con la urgencia y el impacto real de cada tarea.
              </p>
            </div>

            {/* Workspace Toolbar Actions */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsPillarModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Configurar Prioridades</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setEditorDefaultPillarId(undefined);
                  setIsTaskEditorOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nueva tarea</span>
              </button>

              <button
                type="button"
                onClick={() => handleSyncAllToGoogleTasks()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span>
                  Aplicar Orden en Google Tasks
                  {dirtyTasksCount > 0 ? ` (${dirtyTasksCount})` : ''}
                </span>
              </button>

              {isConnectedToGoogle && token && (
                <>
                  <button
                    type="button"
                    onClick={() => loadTasksFromGoogle(token, pillars)}
                    disabled={isLoadingTasks}
                    aria-label="Recargar desde Google Tasks"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingTasks ? 'animate-spin' : ''}`} />
                    <span>{isLoadingTasks ? 'Sincronizando...' : 'Recargar'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    aria-label="Cerrar sesión de Google"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Salir</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Life Priorities Distribution & Interactive Weight Bar */}
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                Equilibrio actual por dimensión de prioridad (clic para filtrar tareas):
              </span>
              <span className="font-mono tabular-nums">
                Tiempo estimado total:{' '}
                {activeTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)} min
              </span>
            </div>

            {/* Proportional visual bar */}
            <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {pillarDistribution.map((p) =>
                p.count > 0 ? (
                  <div
                    key={p.id}
                    style={{
                      width: `${Math.max(5, p.percentage)}%`,
                      backgroundColor: p.accentHex,
                    }}
                    title={`${p.name}: ${p.count} tareas (${p.percentage}%)`}
                    className="h-full transition-all duration-150"
                  />
                ) : null
              )}
            </div>

            {/* Interactive Pillar Filter Selector Row */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {pillarDistribution.map((p, idx) => {
                const isSelected = selectedPillarFilter === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setSelectedPillarFilter((prev) => (prev === p.id ? 'all' : p.id))
                    }
                    className={`flex flex-col justify-between rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        0{idx + 1} · Peso {p.weight}/10
                      </span>
                      <span
                        className="h-2.5 w-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: p.accentHex }}
                      />
                    </div>
                    <div className="mt-2 font-display text-sm font-semibold truncate">
                      {p.name}
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-1.5 text-xs font-mono tabular-nums ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      <span>{p.count} tareas</span>
                      <span aria-hidden="true">·</span>
                      <span>{p.minutes}m</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Quick Task Capture + Filter Bar */}
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
          {/* Quick Add Form */}
          <form onSubmit={handleQuickAddSubmit} className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2">
            <input
              type="text"
              aria-label="Añadir tarea rápida"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Añadir tarea rápida (ej. Caminar 30 min, Llamar a mamá)..."
              className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
            <select
              aria-label="Dimensión de prioridad para tarea rápida"
              value={quickPillarId}
              onChange={(e) => setQuickPillarId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none shrink-0"
            >
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Peso {p.weight})
                </option>
              ))}
            </select>
            <select
              aria-label="Urgencia para tarea rápida"
              value={quickUrgency}
              onChange={(e) => setQuickUrgency(e.target.value as UrgencyLevel)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none shrink-0"
            >
              <option value="critical">Urgencia Crítica</option>
              <option value="high">Urgencia Alta</option>
              <option value="medium">Urgencia Media</option>
              <option value="low">Urgencia Baja</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Priorizar tarea</span>
            </button>
          </form>

          {/* Search & List Filter Controls */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 xl:border-t-0 xl:border-l xl:pl-4 xl:pt-0 shrink-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                aria-label="Buscar tareas"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tarea..."
                className="w-40 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <select
              aria-label="Filtrar por lista de Google Tasks"
              value={selectedListFilter}
              onChange={(e) => setSelectedListFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none"
            >
              <option value="all">Todas las listas ({lists.length})</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  Lista: {l.title}
                </option>
              ))}
            </select>

            {selectedPillarFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedPillarFilter('all')}
                className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 whitespace-nowrap shrink-0"
              >
                Ver todos los pilares
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowCompleted((prev) => !prev)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                showCompleted
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {showCompleted ? 'Ocultar completadas' : 'Mostrar completadas'}
            </button>
          </div>
        </section>

        {/* VIEW 1: TABLERO DE PRIORIDADES (Columns by Life Pillar) */}
        {activeView === 'board' && (
          <section aria-label="Tablero por dimensiones de prioridad" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-slate-700" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Tablero por Dimensiones de Prioridad
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Cambia el pilar o la urgencia de cualquier tarea para recalcular su índice de prioridad al instante.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {pillars
                .filter((p) => selectedPillarFilter === 'all' || p.id === selectedPillarFilter)
                .map((pillar, pIndex) => {
                  const columnTasks = filteredTasks
                    .filter((t) => t.pillarId === pillar.id)
                    .sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars));

                  return (
                    <div
                      key={pillar.id}
                      className="flex flex-col rounded-xl border border-slate-200 bg-white"
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-xs"
                              style={{ backgroundColor: pillar.accentHex }}
                            />
                            <h3 className="font-display text-sm font-bold text-slate-900 truncate">
                              0{pIndex + 1}. {pillar.name}
                            </h3>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                            <span>Peso {pillar.weight}/10</span>
                            <span aria-hidden="true">·</span>
                            <span>{columnTasks.length} tareas</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingTask(null);
                            setEditorDefaultPillarId(pillar.id);
                            setIsTaskEditorOpen(true);
                          }}
                          aria-label={`Añadir tarea en ${pillar.name}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Tasks List in Column */}
                      <div className="flex-1 divide-y divide-slate-200">
                        {columnTasks.length === 0 ? (
                          <div className="px-5 py-8 text-center">
                            <p className="text-xs text-slate-400">
                              No hay tareas activas asignadas a {pillar.name}.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTask(null);
                                setEditorDefaultPillarId(pillar.id);
                                setIsTaskEditorOpen(true);
                              }}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Crear tarea en {pillar.name}</span>
                            </button>
                          </div>
                        ) : (
                          columnTasks.map((task) => (
                            <div
                              key={task.id}
                              className={`p-4 transition-colors hover:bg-slate-50/80 ${
                                task.status === 'completed' ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTaskStatus(task)}
                                    aria-label={
                                      task.status === 'completed'
                                        ? `Reactivar '${task.cleanTitle}'`
                                        : `Completar '${task.cleanTitle}'`
                                    }
                                    className="mt-0.5 text-slate-400 hover:text-slate-900 transition-colors shrink-0"
                                  >
                                    {task.status === 'completed' ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    ) : (
                                      <Circle className="h-4 w-4" />
                                    )}
                                  </button>
                                  <div className="min-w-0">
                                    <p
                                      className={`text-sm font-semibold text-slate-900 ${
                                        task.status === 'completed' ? 'line-through text-slate-500' : ''
                                      }`}
                                    >
                                      {task.cleanTitle}
                                    </p>
                                    {task.cleanNotes && (
                                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                                        {task.cleanNotes}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <span
                                  title="Índice de prioridad calculado (incluye bono por antigüedad)"
                                  className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0"
                                >
                                  {task.priorityScore} pts
                                </span>
                              </div>

                              {/* Zero-Pill Metadata Discipline: Clean unboxed text with · separators */}
                              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-6 text-xs text-slate-500">
                                <span>{task.listTitle}</span>
                                <span aria-hidden="true">·</span>
                                <span>{URGENCY_LABELS[task.urgency]}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-slate-700">
                                  {formatTaskAge(task)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>Vence {formatDueDate(task.due)}</span>
                              </div>

                              {/* Interactive Row Controls */}
                              <div className="mt-3 flex items-center justify-between gap-2 pl-6 pt-1">
                                <div className="flex items-center gap-1.5">
                                  <select
                                    aria-label={`Cambiar dimensión de '${task.cleanTitle}'`}
                                    value={task.pillarId}
                                    onChange={(e) => handleChangeTaskPillar(task.id, e.target.value)}
                                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none"
                                  >
                                    {pillars.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        Mover a: {p.name.split(' ')[0]}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => handleCycleTaskUrgency(task.id)}
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                                  >
                                    Cambiar urgencia
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTask(task);
                                      setIsTaskEditorOpen(true);
                                    }}
                                    aria-label={`Editar '${task.cleanTitle}'`}
                                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTask(task)}
                                    aria-label={`Eliminar '${task.cleanTitle}'`}
                                    className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* VIEW 2: MATRIZ DE IMPACTO VS URGENCIA & COLA MAESTRA */}
        {activeView === 'matrix' && (
          <section aria-label="Matriz de enfoque y cola maestra" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* 2x2 Matrix (7 columns on desktop) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-slate-700" />
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Matriz Interactiva: Urgencia vs. Impacto Vital
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  Haz clic en una tarea para editar su cuadrante
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  {
                    id: 'q1',
                    title: '01. Hacer Ahora (Alta Urgencia · Alto Impacto)',
                    subtitle: 'Prioridad inmediata alineada con tus pilares clave',
                    filter: (t: EnrichedTask) =>
                      (t.urgency === 'critical' || t.urgency === 'high') && t.impact === 'high',
                  },
                  {
                    id: 'q2',
                    title: '02. Planificar con Foco (Baja Urgencia · Alto Impacto)',
                    subtitle: 'Construcción de salud, familia y proyectos a largo plazo',
                    filter: (t: EnrichedTask) =>
                      (t.urgency === 'medium' || t.urgency === 'low') && t.impact === 'high',
                  },
                  {
                    id: 'q3',
                    title: '03. Resolver Rápido (Alta Urgencia · Impacto Medio/Bajo)',
                    subtitle: 'Trámites y gestiones operativas de corto plazo',
                    filter: (t: EnrichedTask) =>
                      (t.urgency === 'critical' || t.urgency === 'high') && t.impact !== 'high',
                  },
                  {
                    id: 'q4',
                    title: '04. Tiempo Libre / Ocio (Baja Urgencia · Impacto Medio/Bajo)',
                    subtitle: 'Actividades recreativas o delegables',
                    filter: (t: EnrichedTask) =>
                      (t.urgency === 'medium' || t.urgency === 'low') && t.impact !== 'high',
                  },
                ].map((quadrant) => {
                  const qTasks = filteredTasks
                    .filter((t) => t.status === 'needsAction' && quadrant.filter(t))
                    .sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars));

                  return (
                    <div
                      key={quadrant.id}
                      className="flex flex-col rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="border-b border-slate-200 pb-3">
                        <h3 className="font-display text-sm font-semibold text-slate-900">
                          {quadrant.title}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">{quadrant.subtitle}</p>
                      </div>

                      <div className="mt-3 flex-1 divide-y divide-slate-100">
                        {qTasks.length === 0 ? (
                          <p className="py-6 text-center text-xs text-slate-400">
                            Sin tareas en este cuadrante.
                          </p>
                        ) : (
                          qTasks.map((task) => {
                            const pillar = pillars.find((p) => p.id === task.pillarId);
                            return (
                              <div
                                key={task.id}
                                className="flex items-start justify-between gap-3 py-2.5"
                              >
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTask(task);
                                      setIsTaskEditorOpen(true);
                                    }}
                                    className="text-left text-xs font-semibold text-slate-900 hover:underline"
                                  >
                                    {task.cleanTitle}
                                  </button>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                    <span
                                      className="h-2 w-2 rounded-xs shrink-0"
                                      style={{ backgroundColor: pillar?.accentHex || '#475569' }}
                                    />
                                    <span>{pillar?.name}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{formatTaskAge(task)}</span>
                                  </div>
                                </div>
                                <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums shrink-0">
                                  {task.priorityScore} pts
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unified Master Prioritized Queue (5 columns on desktop) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-slate-700" />
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Cola Maestra de Ejecución Recomendada
                  </h2>
                </div>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  Top {filteredTasks.filter((t) => t.status === 'needsAction').length} tareas
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200">
                {filteredTasks
                  .filter((t) => t.status === 'needsAction')
                  .sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars))
                  .map((task, idx) => {
                    const pillar = pillars.find((p) => p.id === task.pillarId);
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="font-mono text-xs font-bold text-slate-400 tabular-nums mt-0.5">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {task.cleanTitle}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <span
                                className="h-2 w-2 rounded-xs shrink-0"
                                style={{ backgroundColor: pillar?.accentHex || '#475569' }}
                              />
                              <span>{pillar?.name}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{formatTaskAge(task)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                            {task.priorityScore}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleTaskStatus(task)}
                            aria-label={`Completar '${task.cleanTitle}' desde cola maestra`}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                          >
                            Completar
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        {/* VIEW 3: LISTAS DE GOOGLE TASKS (Reflect changes per Google TaskList) */}
        {activeView === 'lists' && (
          <section aria-label="Listas originales de Google Tasks" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Tus Listas de Google Tasks y Vista Previa de Sincronización
                </h2>
                <p className="text-xs text-slate-500">
                  Revisa cómo quedará ordenada cada lista en Google Tasks y sincroniza individualmente o en bloque.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTitlePrefixOnSync}
                  onChange={(e) => setIncludeTitlePrefixOnSync(e.target.checked)}
                  className="rounded border-slate-300 accent-slate-900"
                />
                <span>Prefijar "[Prioridad]" en el título de Google Tasks al sincronizar</span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {lists.map((list) => {
                const listTasks = tasks
                  .filter((t) => t.listId === list.id && (showCompleted || t.status === 'needsAction'))
                  .sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars));

                return (
                  <div
                    key={list.id}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                      <div>
                        <h3 className="font-display text-sm font-bold text-slate-900">
                          {list.title}
                        </h3>
                        <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                          {listTasks.length} tareas ordenadas por prioridad y antigüedad
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSyncAllToGoogleTasks(list.id)}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                      >
                        Sincronizar esta lista
                      </button>
                    </div>

                    <div className="flex-1 divide-y divide-slate-200">
                      {listTasks.length === 0 ? (
                        <p className="p-6 text-center text-xs text-slate-400">
                          No hay tareas pendientes en esta lista.
                        </p>
                      ) : (
                        listTasks.map((task, idx) => {
                          const pillar = pillars.find((p) => p.id === task.pillarId);
                          const pShort = pillar ? pillar.name.split(' ')[0] : task.pillarId;
                          return (
                            <div key={task.id} className="p-4 hover:bg-slate-50/70">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-baseline gap-2 min-w-0">
                                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                                    #{idx + 1}
                                  </span>
                                  <p className="text-xs font-semibold text-slate-900">
                                    {includeTitlePrefixOnSync
                                      ? `[${pShort}] ${task.cleanTitle}`
                                      : task.cleanTitle}
                                  </p>
                                </div>
                                <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                                  {task.priorityScore} pts
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5 text-xs text-slate-500">
                                <span>{pillar?.name}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{formatTaskAge(task)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{URGENCY_LABELS[task.urgency]}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* VIEW 4: DIMENSIONES DE VIDA (Direct interactive sliders + explanation) */}
        {activeView === 'pillars' && (
          <section aria-label="Ajuste interactivo de dimensiones de vida" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Calibración de tus Dimensiones de Vida
                </h2>
                <p className="text-xs text-slate-500">
                  Desliza el peso de cada dimensión (1 a 10) para observar cómo cambia en tiempo real el orden de tus tareas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPillarModalOpen(true)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Añadir o reordenar dimensiones
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pillarDistribution.map((pillar, idx) => (
                <div
                  key={pillar.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums">
                        Prioridad #{idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                        Peso {pillar.weight}/10 ({pillar.weight * 4} pts base)
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-xs shrink-0"
                        style={{ backgroundColor: pillar.accentHex }}
                      />
                      <h3 className="font-display text-base font-bold text-slate-900">
                        {pillar.name}
                      </h3>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">{pillar.description}</p>
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <label htmlFor={`inline-slider-${pillar.id}`} className="font-medium">
                        Ajustar peso vital:
                      </label>
                      <span className="font-mono tabular-nums">
                        {pillar.count} tareas ({pillar.minutes} min)
                      </span>
                    </div>
                    <input
                      id={`inline-slider-${pillar.id}`}
                      type="range"
                      min={1}
                      max={10}
                      value={pillar.weight}
                      onChange={(e) => handleInlineWeightChange(pillar.id, Number(e.target.value))}
                      className="mt-2 h-1.5 w-full cursor-pointer accent-slate-900"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Modals */}
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
