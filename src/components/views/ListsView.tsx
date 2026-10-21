import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  type EnrichedTask,
  type GoogleTaskList,
  type PriorityPillar,
  compareTasksByPriorityAndAge,
} from '../../utils/priorityEngine';
import { formatDueLabel } from '../../utils/dates';
import { scoreColor } from '../taskUi';

interface ListsViewProps {
  lists: GoogleTaskList[];
  tasks: EnrichedTask[];
  pillars: PriorityPillar[];
  showCompleted: boolean;
  includeTitlePrefix: boolean;
  onToggleTitlePrefix: (value: boolean) => void;
  onSyncList: (listId: string) => void;
}

export const ListsView: React.FC<ListsViewProps> = ({
  lists,
  tasks,
  pillars,
  showCompleted,
  includeTitlePrefix,
  onToggleTitlePrefix,
  onSyncList,
}) => (
  <section aria-label="Listas originales de Google Tasks" className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-display text-base font-semibold text-slate-900">Así quedarán tus listas en Google Tasks</h2>
        <p className="text-xs text-slate-500">
          Vista previa del orden que se aplicará en cada lista. Las subtareas se mantienen dentro de su tarea madre.
        </p>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
        <input
          type="checkbox"
          checked={includeTitlePrefix}
          onChange={(e) => onToggleTitlePrefix(e.target.checked)}
          className="rounded border-slate-300 accent-slate-900"
        />
        <span>Prefijar "[Área]" en el título al sincronizar</span>
      </label>
    </div>

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {lists.map((list) => {
        const sorted = tasks
          .filter((t) => t.listId === list.id && (showCompleted || t.status === 'needsAction'))
          .sort((a, b) => compareTasksByPriorityAndAge(a, b, pillars));
        // Mirror Google Tasks: subtasks stay right below their parent.
        const ids = new Set(sorted.map((t) => t.id));
        const listTasks: EnrichedTask[] = [];
        for (const t of sorted.filter((x) => !x.parent || !ids.has(x.parent))) {
          listTasks.push(t, ...sorted.filter((c) => c.parent === t.id));
        }
        let topIndex = 0;
        const dirty = listTasks.filter((t) => t.isDirty).length;

        return (
          <div key={list.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate font-display text-sm font-bold text-slate-900">{list.title}</h3>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-500">
                  {listTasks.length} tareas{dirty ? ` · ${dirty} con cambios` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSyncList(list.id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                <RefreshCw className="h-3 w-3" /> Aplicar orden
              </button>
            </div>

            <ol className="flex-1 divide-y divide-slate-100">
              {listTasks.length === 0 ? (
                <li className="p-6 text-center text-xs text-slate-400">No hay tareas pendientes en esta lista.</li>
              ) : (
                listTasks.map((task) => {
                  const isChild = Boolean(task.parent && ids.has(task.parent));
                  if (!isChild) topIndex += 1;
                  const pillar = pillars.find((p) => p.id === task.pillarId);
                  const pShort = pillar ? pillar.name.split(' ')[0] : task.pillarId;
                  return (
                    <li key={task.id} className={`flex items-center gap-3 px-4 py-2.5 ${isChild ? 'pl-10' : ''}`}>
                      <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-slate-400">
                        {isChild ? '↳' : topIndex}
                      </span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pillar?.accentHex }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {includeTitlePrefix ? `[${pShort}] ${task.cleanTitle}` : task.cleanTitle}
                        </p>
                        <p className="text-[11px] text-slate-500">{formatDueLabel(task.due)}</p>
                      </div>
                      <span
                        className="shrink-0 font-mono text-xs font-bold tabular-nums"
                        style={{ color: scoreColor(task.priorityScore) }}
                      >
                        {task.priorityScore}
                      </span>
                    </li>
                  );
                })
              )}
            </ol>
          </div>
        );
      })}
    </div>
  </section>
);
