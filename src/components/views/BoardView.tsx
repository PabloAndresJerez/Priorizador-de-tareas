import React, { useState } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import type { EnrichedTask, PriorityPillar } from '../../utils/priorityEngine';
import { formatMinutes } from '../../utils/dates';
import { TaskCard, type TaskActions } from '../TaskCard';

interface BoardViewProps extends TaskActions {
  tasks: EnrichedTask[];
  pillars: PriorityPillar[];
  selectedPillarFilter: string;
  onMoveToPillar: (taskId: string, pillarId: string) => void;
  onAddInPillar: (pillarId: string) => void;
}

export const BoardView: React.FC<BoardViewProps> = ({
  tasks,
  pillars,
  selectedPillarFilter,
  onMoveToPillar,
  onAddInPillar,
  ...actions
}) => {
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <section aria-label="Tablero por áreas de vida" className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-slate-700" />
          <h2 className="font-display text-base font-semibold text-slate-900">Tablero por áreas de vida</h2>
        </div>
        <p className="text-xs text-slate-500">Arrastrá una tarea a otra columna para cambiarle el área: el puntaje se recalcula al instante.</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-3 [scroll-snap-type:x_mandatory]">
        {pillars
          .filter((p) => selectedPillarFilter === 'all' || p.id === selectedPillarFilter)
          .map((pillar) => {
            const columnTasks = tasks.filter((t) => t.pillarId === pillar.id);
            const minutes = columnTasks
              .filter((t) => t.status === 'needsAction')
              .reduce((s, t) => s + t.estimatedMinutes, 0);
            const isOver = dragOver === pillar.id;
            return (
              <div
                key={pillar.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(pillar.id);
                }}
                onDragLeave={() => setDragOver((prev) => (prev === pillar.id ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/task-id');
                  setDragOver(null);
                  if (id) onMoveToPillar(id, pillar.id);
                }}
                className={`flex w-[85vw] max-w-[340px] shrink-0 flex-col rounded-2xl border bg-slate-100/60 transition-colors [scroll-snap-align:start] sm:w-[320px] ${
                  isOver ? 'border-slate-900 bg-slate-200/70' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: pillar.accentHex }} />
                      <h3 className="truncate font-display text-sm font-bold text-slate-900">{pillar.name}</h3>
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] tabular-nums text-slate-500">
                      <span>Peso {pillar.weight}/10</span>
                      <span aria-hidden="true">·</span>
                      <span>{columnTasks.length} tareas</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatMinutes(minutes)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddInPillar(pillar.id)}
                    aria-label={`Añadir tarea en ${pillar.name}`}
                    className="shrink-0 rounded-lg bg-white p-1.5 text-slate-600 ring-1 ring-slate-200 hover:text-slate-900"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-2 p-3 pt-1">
                  {columnTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-400">
                      Soltá una tarea acá
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} pillars={pillars} draggable showPillar={false} {...actions} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
};
