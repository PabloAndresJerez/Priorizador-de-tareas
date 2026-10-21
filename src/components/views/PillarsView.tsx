import React from 'react';
import type { PriorityPillar } from '../../utils/priorityEngine';
import { formatMinutes } from '../../utils/dates';

export interface PillarStat extends PriorityPillar {
  count: number;
  minutes: number;
  percentage: number;
}

interface PillarsViewProps {
  stats: PillarStat[];
  onWeightChange: (pillarId: string, weight: number) => void;
  onOpenConfig: () => void;
}

export const PillarsView: React.FC<PillarsViewProps> = ({ stats, onWeightChange, onOpenConfig }) => {
  const totalWeight = stats.reduce((s, p) => s + p.weight, 0) || 1;
  const totalMinutes = stats.reduce((s, p) => s + p.minutes, 0) || 1;

  return (
    <section aria-label="Ajuste de áreas de vida" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">Tus áreas de vida</h2>
          <p className="text-xs text-slate-500">
            Mové el peso de cada área y mirá cómo se reordena todo. Abajo comparás lo que te importa contra dónde va tu tiempo.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenConfig}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Añadir, renombrar o reordenar áreas
        </button>
      </div>

      {/* Importance vs. time comparison */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-display text-sm font-semibold text-slate-900">Lo que te importa vs. dónde está tu carga</h3>
        <div className="mt-4 space-y-3">
          {stats.map((p) => {
            const importancePct = Math.round((p.weight / totalWeight) * 100);
            const timePct = Math.round((p.minutes / totalMinutes) * 100);
            const gap = timePct - importancePct;
            return (
              <div key={p.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.accentHex }} />
                  <span className="truncate">{p.name.split(' ')[0]}</span>
                </span>
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-slate-100" title={`Importancia relativa: ${importancePct}%`}>
                    <div className="h-full rounded-full opacity-40" style={{ width: `${importancePct}%`, backgroundColor: p.accentHex }} />
                  </div>
                  <div className="h-2 rounded-full bg-slate-100" title={`Carga de tareas: ${timePct}%`}>
                    <div className="h-full rounded-full" style={{ width: `${timePct}%`, backgroundColor: p.accentHex }} />
                  </div>
                </div>
                <span
                  className={`w-14 text-right font-mono tabular-nums ${
                    Math.abs(gap) < 8 ? 'text-slate-400' : gap > 0 ? 'text-amber-700' : 'text-sky-700'
                  }`}
                  title={gap > 0 ? 'Más carga que importancia' : 'Menos carga que importancia'}
                >
                  {gap > 0 ? '+' : ''}
                  {gap}%
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Barra clara: importancia que le diste. Barra fuerte: minutos de tareas pendientes. Un número alto positivo indica un área que se lleva más tiempo del que querés darle.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((pillar, idx) => (
          <div
            key={pillar.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
            style={{ borderTop: `3px solid ${pillar.accentHex}` }}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-400">#{idx + 1}</span>
                <span className="font-display text-2xl font-bold tabular-nums" style={{ color: pillar.accentHex }}>
                  {pillar.weight}
                  <span className="text-sm text-slate-400">/10</span>
                </span>
              </div>
              <h3 className="mt-1 font-display text-base font-bold text-slate-900">{pillar.name}</h3>
              <p className="mt-1 text-xs text-slate-600">{pillar.description}</p>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <label htmlFor={`inline-slider-${pillar.id}`} className="font-medium">
                  Peso
                </label>
                <span className="font-mono tabular-nums">
                  {pillar.count} tareas · {formatMinutes(pillar.minutes)}
                </span>
              </div>
              <input
                id={`inline-slider-${pillar.id}`}
                type="range"
                min={1}
                max={10}
                value={pillar.weight}
                onChange={(e) => onWeightChange(pillar.id, Number(e.target.value))}
                className="mt-2 h-1.5 w-full cursor-pointer"
                style={{ accentColor: pillar.accentHex }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
