import React, { useMemo, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import {
  type EnrichedTask,
  type PriorityPillar,
  type QuadrantId,
  QUADRANT_META,
  importanceFactor,
  urgencyFactor,
} from '../../utils/priorityEngine';
import { formatDueLabel, formatMinutes } from '../../utils/dates';
import { ScoreRing } from '../ScoreVisuals';
import type { TaskActions } from '../TaskCard';

interface MatrixViewProps extends TaskActions {
  tasks: EnrichedTask[];
  pillars: PriorityPillar[];
}

const W = 1000;
const H = 560;
const PAD = { l: 56, r: 24, t: 24, b: 48 };
const URGENT_X = 0.6;
const IMPORTANT_Y = 0.7;
const Y_MIN = 0.15;

function hashJitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 1000) / 1000) * 0.03;
}

export const MatrixView: React.FC<MatrixViewProps> = ({ tasks, pillars, onEdit, onToggle }) => {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const active = useMemo(() => tasks.filter((t) => t.status === 'needsAction'), [tasks]);

  const points = useMemo(
    () =>
      active.map((t) => {
        const u = Math.min(1, urgencyFactor(t) + hashJitter(t.id));
        const i = importanceFactor(t, pillars) + hashJitter(t.id + 'y');
        // Keep a margin so bubbles at the extremes are not clipped by the plot edges.
        const x = PAD.l + (0.03 + 0.94 * u) * (W - PAD.l - PAD.r);
        const y = PAD.t + (0.04 + 0.92 * (1 - (i - Y_MIN) / (1.05 - Y_MIN))) * (H - PAD.t - PAD.b);
        const r = 8 + Math.sqrt(t.estimatedMinutes) * 1.6;
        return { task: t, x, y, r, pillar: pillars.find((p) => p.id === t.pillarId) };
      }),
    [active, pillars]
  );

  const xLine = PAD.l + (0.03 + 0.94 * URGENT_X) * (W - PAD.l - PAD.r);
  const yLine = PAD.t + (0.04 + 0.92 * (1 - (IMPORTANT_Y - Y_MIN) / (1.05 - Y_MIN))) * (H - PAD.t - PAD.b);
  const hovered = points.find((p) => p.task.id === hoverId);

  const zones: Array<{ id: QuadrantId; x: number; y: number; w: number; h: number; anchor: 'start'; tx: number }> = [
    { id: 'plan', x: PAD.l, y: PAD.t, w: xLine - PAD.l, h: yLine - PAD.t, anchor: 'start', tx: PAD.l + 12 },
    { id: 'do', x: xLine, y: PAD.t, w: W - PAD.r - xLine, h: yLine - PAD.t, anchor: 'start', tx: xLine + 12 },
    { id: 'later', x: PAD.l, y: yLine, w: xLine - PAD.l, h: H - PAD.b - yLine, anchor: 'start', tx: PAD.l + 12 },
    { id: 'quick', x: xLine, y: yLine, w: W - PAD.r - xLine, h: H - PAD.b - yLine, anchor: 'start', tx: xLine + 12 },
  ];

  return (
    <section aria-label="Matriz de urgencia e importancia" className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-slate-700" />
          <h2 className="font-display text-base font-semibold text-slate-900">Mapa de prioridades</h2>
        </div>
        <p className="text-xs text-slate-500">
          Cada burbuja es una tarea: más a la derecha = más urgente, más arriba = más importante, más grande = más tiempo. Clic para editar.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 sm:p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfico de urgencia contra importancia">
          {zones.map((z) => (
            <g key={z.id}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={QUADRANT_META[z.id].tone} opacity={0.05} />
              <text
                x={z.tx}
                y={z.id === 'plan' || z.id === 'do' ? z.y + 24 : z.y + z.h - 14}
                textAnchor={z.anchor}
                className="font-display"
                fontSize="18"
                fontWeight="700"
                fill={QUADRANT_META[z.id].tone}
                opacity={0.55}
              >
                {QUADRANT_META[z.id].title}
              </text>
            </g>
          ))}
          <line x1={xLine} x2={xLine} y1={PAD.t} y2={H - PAD.b} stroke="#CBD5E1" strokeDasharray="6 6" />
          <line x1={PAD.l} x2={W - PAD.r} y1={yLine} y2={yLine} stroke="#CBD5E1" strokeDasharray="6 6" />
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#94A3B8" />
          <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="#94A3B8" />
          <text x={(W + PAD.l) / 2} y={H - 12} textAnchor="middle" fontSize="15" fill="#64748B">
            Urgencia →
          </text>
          <text x={18} y={(H - PAD.b + PAD.t) / 2} textAnchor="middle" fontSize="15" fill="#64748B" transform={`rotate(-90 18 ${(H - PAD.b + PAD.t) / 2})`}>
            Importancia →
          </text>

          {[...points]
            .sort((a, b) => b.r - a.r)
            .map((p) => (
              <g
                key={p.task.id}
                onMouseEnter={() => setHoverId(p.task.id)}
                onMouseLeave={() => setHoverId(null)}
                onFocus={() => setHoverId(p.task.id)}
                onBlur={() => setHoverId(null)}
                onClick={() => onEdit(p.task)}
                onKeyDown={(e) => e.key === 'Enter' && onEdit(p.task)}
                tabIndex={0}
                role="button"
                aria-label={`${p.task.cleanTitle}, ${p.task.priorityScore} puntos`}
                className="cursor-pointer outline-none"
                style={{ transition: 'transform 300ms ease' }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  fill={p.pillar?.accentHex || '#64748B'}
                  fillOpacity={hoverId === p.task.id ? 0.95 : 0.7}
                  stroke="#fff"
                  strokeWidth={2}
                />
                {p.r > 14 && (
                  <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" pointerEvents="none">
                    {p.task.priorityScore}
                  </text>
                )}
              </g>
            ))}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg"
            style={{
              left: `min(calc(${(hovered.x / W) * 100}% + 12px), calc(100% - 17rem))`,
              top: `calc(${(hovered.y / H) * 100}% + 12px)`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900">{hovered.task.cleanTitle}</p>
              <ScoreRing score={hovered.task.priorityScore} size={32} stroke={3} />
            </div>
            <p className="mt-1 text-slate-500">
              {hovered.pillar?.name} · {formatDueLabel(hovered.task.due)} · {formatMinutes(hovered.task.estimatedMinutes)}
            </p>
            {hovered.task.reasons && hovered.task.reasons.length > 0 && (
              <p className="mt-1 text-slate-600">{hovered.task.reasons.join(' · ')}</p>
            )}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-3 px-2 text-[11px] text-slate-500">
          {pillars.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.accentHex }} />
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(['do', 'plan', 'quick', 'later'] as QuadrantId[]).map((q) => {
          const qTasks = active.filter((t) => t.quadrant === q);
          const meta = QUADRANT_META[q];
          return (
            <div key={q} className="rounded-xl border border-slate-200 bg-white p-4" style={{ borderTop: `3px solid ${meta.tone}` }}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-sm font-bold" style={{ color: meta.tone }}>
                  {meta.title}
                </h3>
                <span className="font-mono text-xs tabular-nums text-slate-400">{qTasks.length}</span>
              </div>
              <p className="text-[11px] text-slate-500">{meta.subtitle}</p>
              <ul className="mt-3 space-y-1.5">
                {qTasks.length === 0 && <li className="py-3 text-center text-xs text-slate-400">Vacío</li>}
                {qTasks.map((t) => {
                  const pillar = pillars.find((p) => p.id === t.pillarId);
                  return (
                    <li key={t.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggle(t)}
                        aria-label={`Completar '${t.cleanTitle}'`}
                        className="h-3.5 w-3.5 shrink-0 rounded-full border-2 hover:bg-emerald-100"
                        style={{ borderColor: pillar?.accentHex }}
                      />
                      <button type="button" onClick={() => onEdit(t)} className="min-w-0 flex-1 truncate text-left text-xs text-slate-800 hover:underline">
                        {t.cleanTitle}
                      </button>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500">{t.priorityScore}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
};
