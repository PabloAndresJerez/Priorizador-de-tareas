import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  type EnrichedTask,
  type GoogleTaskList,
  type ImpactLevel,
  type PriorityPillar,
  type UrgencyLevel,
} from '../utils/priorityEngine';

interface TaskEditorModalProps {
  isOpen: boolean;
  initialTask: EnrichedTask | null;
  lists: GoogleTaskList[];
  pillars: PriorityPillar[];
  defaultPillarId?: string;
  defaultListId?: string;
  onClose: () => void;
  onSaveTask: (taskData: {
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
  }) => void;
}

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
  isOpen,
  initialTask,
  lists,
  pillars,
  defaultPillarId,
  defaultListId,
  onClose,
  onSaveTask,
}) => {
  const [cleanTitle, setCleanTitle] = useState('');
  const [cleanNotes, setCleanNotes] = useState('');
  const [listId, setListId] = useState('');
  const [pillarId, setPillarId] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('medium');
  const [impact, setImpact] = useState<ImpactLevel>('high');
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [createdDate, setCreatedDate] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTask) {
      setCleanTitle(initialTask.cleanTitle);
      setCleanNotes(initialTask.cleanNotes);
      setListId(initialTask.listId);
      setPillarId(initialTask.pillarId);
      setUrgency(initialTask.urgency);
      setImpact(initialTask.impact);
      setEstimatedMinutes(initialTask.estimatedMinutes);
      setDueDate(initialTask.due ? initialTask.due.slice(0, 10) : '');
      setCreatedDate(
        initialTask.createdAt
          ? initialTask.createdAt.slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      );
    } else {
      setCleanTitle('');
      setCleanNotes('');
      setListId(defaultListId || lists[0]?.id || 'list-personal');
      setPillarId(defaultPillarId || pillars[0]?.id || 'salud');
      setUrgency('high');
      setImpact('high');
      setEstimatedMinutes(30);
      setDueDate('');
      setCreatedDate(new Date().toISOString().slice(0, 10));
    }
    setValidationError(null);
  }, [initialTask, isOpen, defaultListId, defaultPillarId, lists, pillars]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cleanTitle.trim();
    if (!trimmed) {
      setValidationError('El título de la tarea es obligatorio.');
      return;
    }

    let resolvedCreatedAt = initialTask?.createdAt || new Date().toISOString();
    if (createdDate) {
      const existingDatePrefix = initialTask?.createdAt?.slice(0, 10);
      if (existingDatePrefix !== createdDate) {
        resolvedCreatedAt = new Date(`${createdDate}T09:00:00`).toISOString();
      }
    }

    onSaveTask({
      id: initialTask?.id,
      listId: listId || lists[0]?.id || 'list-personal',
      cleanTitle: trimmed,
      cleanNotes: cleanNotes.trim(),
      pillarId: pillarId || pillars[0]?.id || 'salud',
      urgency,
      impact,
      estimatedMinutes: Math.max(5, Number(estimatedMinutes) || 30),
      due: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : undefined,
      createdAt: resolvedCreatedAt,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-editor-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h2 id="task-editor-title" className="text-base font-semibold text-slate-900">
            {initialTask ? 'Editar tarea y prioridad' : 'Nueva tarea priorizada'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar editor de tarea"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {validationError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {validationError}
            </div>
          )}

          <div>
            <label htmlFor="task-title-input" className="block text-xs font-medium text-slate-700">
              Título de la tarea
            </label>
            <input
              id="task-title-input"
              type="text"
              value={cleanTitle}
              onChange={(e) => setCleanTitle(e.target.value)}
              placeholder="Ej. Turno con el cardiólogo, Cena con la familia..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="task-pillar-select" className="block text-xs font-medium text-slate-700">
                Dimensión de prioridad
              </label>
              <select
                id="task-pillar-select"
                value={pillarId}
                onChange={(e) => setPillarId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {pillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Peso {p.weight}/10)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="task-list-select" className="block text-xs font-medium text-slate-700">
                Lista de Google Tasks
              </label>
              <select
                id="task-list-select"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="task-urgency-select" className="block text-xs font-medium text-slate-700">
                Urgencia temporal
              </label>
              <select
                id="task-urgency-select"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                <option value="critical">Crítica (Hoy / 24h)</option>
                <option value="high">Alta (Esta semana)</option>
                <option value="medium">Media (Próximos días)</option>
                <option value="low">Baja (Sin prisa)</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-impact-select" className="block text-xs font-medium text-slate-700">
                Impacto personal
              </label>
              <select
                id="task-impact-select"
                value={impact}
                onChange={(e) => setImpact(e.target.value as ImpactLevel)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                <option value="high">Alto impacto</option>
                <option value="medium">Impacto medio</option>
                <option value="low">Impacto bajo</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-minutes-input" className="block text-xs font-medium text-slate-700">
                Tiempo estimado (min)
              </label>
              <input
                id="task-minutes-input"
                type="number"
                min={5}
                max={480}
                step={5}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="task-created-input" className="block text-xs font-medium text-slate-700">
                Fecha de carga (antigüedad)
              </label>
              <input
                id="task-created-input"
                type="date"
                value={createdDate}
                onChange={(e) => setCreatedDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="task-due-input" className="block text-xs font-medium text-slate-700">
                Fecha límite (opcional)
              </label>
              <input
                id="task-due-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="task-notes-input" className="block text-xs font-medium text-slate-700">
              Notas adicionales
            </label>
            <input
              id="task-notes-input"
              type="text"
              value={cleanNotes}
              onChange={(e) => setCleanNotes(e.target.value)}
              placeholder="Detalles que se guardarán en Google Tasks..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {initialTask ? 'Guardar cambios' : 'Crear y priorizar tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
