import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import type { GoogleTaskList, PriorityPillar } from '../utils/priorityEngine';
import { type QuickAddDraft, parseQuickAdd } from '../utils/quickAddParser';
import { formatDueLabel, formatMinutes, ymdToGoogleDue } from '../utils/dates';
import { PillarTag } from './TaskCard';
import { IMPACT_LABELS, URGENCY_LABELS } from './taskUi';

interface SmartQuickAddProps {
  pillars: PriorityPillar[];
  lists: GoogleTaskList[];
  defaultListId?: string;
  onSubmit: (draft: QuickAddDraft, listId: string) => void;
}

const EXAMPLES = [
  'Pagar tarjeta mañana 15m #finanzas',
  'Turno dentista el viernes 1h',
  'Entregar propuesta 28/10 !!! *alto',
  'Llamar a mamá hoy 10m',
];

export const SmartQuickAdd: React.FC<SmartQuickAddProps> = ({ pillars, lists, defaultListId, onSubmit }) => {
  const [text, setText] = useState('');
  const [listId, setListId] = useState(defaultListId || lists[0]?.id || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultListId) setListId(defaultListId);
    else if (!lists.some((l) => l.id === listId)) setListId(lists[0]?.id || '');
  }, [defaultListId, lists]);

  // "/" focuses the quick-add box from anywhere
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const listTitle = lists.find((l) => l.id === listId)?.title || '';
  const draft = useMemo(() => (text.trim() ? parseQuickAdd(text, pillars, Date.now(), listTitle) : null), [
    text,
    pillars,
    listTitle,
  ]);
  const pillar = pillars.find((p) => p.id === draft?.pillarId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !draft.title) return;
    onSubmit(draft, listId);
    setText('');
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Añadir tarea en lenguaje natural"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribí como hablás: «Pagar tarjeta mañana 15m #finanzas»  (atajo: /)"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Lista de destino"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none sm:flex-none"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!draft?.title}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      </div>

      <div className="mt-2.5 min-h-[24px] text-xs">
        {draft && draft.title ? (
          <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
            <span className="font-medium text-slate-900">«{draft.title}»</span>
            <span className="text-slate-300">→</span>
            <PillarTag pillar={pillar} />
            {!draft.pillarExplicit && <span className="text-[11px] text-slate-400">(detectado)</span>}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px]">
              {draft.dueYmd ? formatDueLabel(ymdToGoogleDue(draft.dueYmd)) : 'Sin fecha'}
            </span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px]">{formatMinutes(draft.estimatedMinutes)}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px]">{URGENCY_LABELS[draft.urgency]}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px]">{IMPACT_LABELS[draft.impact]}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-slate-400">
            <span>Probá:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setText(ex);
                  inputRef.current?.focus();
                }}
                className="rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-500 hover:border-violet-400 hover:text-violet-700"
              >
                {ex}
              </button>
            ))}
            <span className="hidden text-[11px] lg:inline">
              · <code>#área</code> <code>!alta</code>/<code>!!!</code> <code>*alto</code> <code>30m</code> <code>hoy</code>/<code>viernes</code>/<code>28/10</code>
            </span>
          </div>
        )}
      </div>
    </form>
  );
};
