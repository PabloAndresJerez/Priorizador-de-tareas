import React from 'react';
import { CalendarClock, CheckCircle2, Circle, Clock, Edit3, GripVertical, Trash2, Zap } from 'lucide-react';
import type { EnrichedTask, PriorityPillar } from '../utils/priorityEngine';
import { daysUntilDue, formatDueLabel, formatMinutes } from '../utils/dates';
import { ScoreBreakdownBar, ScoreRing } from './ScoreVisuals';
import { URGENCY_LABELS } from './taskUi';

export interface TaskActions {
  onToggle: (task: EnrichedTask) => void;
  onEdit: (task: EnrichedTask) => void;
  onDelete: (task: EnrichedTask) => void;
  onCycleUrgency?: (taskId: string) => void;
}

interface TaskCardProps extends TaskActions {
  task: EnrichedTask;
  pillars: PriorityPillar[];
  rank?: number;
  draggable?: boolean;
  showPillar?: boolean;
  showList?: boolean;
}

export function DueChip({ due }: { due?: string }) {
  if (!due) return null;
  const days = daysUntilDue(due) ?? 99;
  const tone =
    days < 0
      ? 'bg-red-50 text-red-700 ring-red-200'
      : days <= 1
        ? 'bg-orange-50 text-orange-700 ring-orange-200'
        : days <= 7
          ? 'bg-amber-50 text-amber-800 ring-amber-200'
          : 'bg-slate-50 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}>
      <CalendarClock className="h-3 w-3" />
      {formatDueLabel(due)}
    </span>
  );
}

export function PillarTag({ pillar }: { pillar?: PriorityPillar }) {
  if (!pillar) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${pillar.accentHex}14`, color: pillar.accentHex }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pillar.accentHex }} />
      {pillar.name.split(' ')[0]}
    </span>
  );
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  pillars,
  rank,
  draggable = false,
  showPillar = true,
  showList = true,
  onToggle,
  onEdit,
  onDelete,
  onCycleUrgency,
}) => {
  const pillar = pillars.find((p) => p.id === task.pillarId);
  const isDone = task.status === 'completed';

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group relative rounded-xl border border-slate-200 bg-white p-3.5 transition-all hover:border-slate-300 hover:shadow-sm ${
        isDone ? 'opacity-60' : ''
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ borderLeft: `3px solid ${pillar?.accentHex || '#94A3B8'}` }}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-400" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onToggle(task)}
          aria-label={isDone ? `Reactivar '${task.cleanTitle}'` : `Completar '${task.cleanTitle}'`}
          className="mt-0.5 shrink-0 text-slate-300 transition-colors hover:text-emerald-600"
        >
          {isDone ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {rank !== undefined && (
              <span className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-400">
                {String(rank).padStart(2, '0')}
              </span>
            )}
            <button
              type="button"
              onClick={() => onEdit(task)}
              className={`text-left text-sm font-semibold leading-snug text-slate-900 hover:underline ${
                isDone ? 'line-through text-slate-500' : ''
              }`}
            >
              {task.cleanTitle}
            </button>
          </div>
          {task.cleanNotes && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{task.cleanNotes}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {showPillar && <PillarTag pillar={pillar} />}
            <DueChip due={task.due} />
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              {task.estimatedMinutes <= 15 ? <Zap className="h-3 w-3 text-emerald-600" /> : <Clock className="h-3 w-3" />}
              {formatMinutes(task.estimatedMinutes)}
            </span>
            {showList && <span className="text-[11px] text-slate-400">{task.listTitle}</span>}
            {task.parent && <span className="text-[11px] text-slate-400">· subtarea</span>}
            {task.isDirty && (
              <span className="text-[11px] font-medium text-amber-700" title="Cambio pendiente de aplicar en Google Tasks">
                · sin sincronizar
              </span>
            )}
          </div>

          {!isDone && task.reasons && task.reasons.length > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">Por qué: </span>
              {task.reasons.slice(0, 3).join(' · ')}
            </p>
          )}

          {!isDone && (
            <div className="mt-2">
              <ScoreBreakdownBar breakdown={task.breakdown} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!isDone && <ScoreRing score={task.priorityScore} size={40} />}
          <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {onCycleUrgency && !isDone && (
              <button
                type="button"
                onClick={() => onCycleUrgency(task.id)}
                title={`${URGENCY_LABELS[task.urgency]} (clic para cambiar)`}
                aria-label={`Cambiar urgencia de '${task.cleanTitle}'`}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
              >
                <Zap className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(task)}
              aria-label={`Editar '${task.cleanTitle}'`}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(task)}
              aria-label={`Eliminar '${task.cleanTitle}'`}
              className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
