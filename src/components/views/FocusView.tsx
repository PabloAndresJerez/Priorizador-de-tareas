import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, Sparkles, Target, Timer } from 'lucide-react';
import type { EnrichedTask, PriorityPillar } from '../../utils/priorityEngine';
import { type Insight, buildDailyPlan, buildInsights } from '../../utils/planner';
import { daysUntilDue, formatMinutes } from '../../utils/dates';
import { ScoreBreakdownBar, ScoreRing } from '../ScoreVisuals';
import { DueChip, PillarTag, TaskCard, type TaskActions } from '../TaskCard';

interface FocusViewProps extends TaskActions {
  tasks: EnrichedTask[]; // filtered, sorted
  allTasks: EnrichedTask[];
  pillars: PriorityPillar[];
  budgetMinutes: number;
  onBudgetChange: (minutes: number) => void;
  onSelectPillar: (pillarId: string) => void;
}

const BUDGETS = [30, 60, 120, 180, 240, 360];

const INSIGHT_STYLE: Record<Insight['tone'], { icon: React.ElementType; className: string }> = {
  danger: { icon: AlertTriangle, className: 'border-red-200 bg-red-50 text-red-900' },
  warning: { icon: Lightbulb, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-900' },
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
};

export const FocusView: React.FC<FocusViewProps> = ({
  tasks,
  allTasks,
  pillars,
  budgetMinutes,
  onBudgetChange,
  onSelectPillar,
  ...actions
}) => {
  const active = useMemo(() => tasks.filter((t) => t.status === 'needsAction'), [tasks]);
  const plan = useMemo(() => buildDailyPlan(active, budgetMinutes), [active, budgetMinutes]);
  const insights = useMemo(() => buildInsights(allTasks, pillars), [allTasks, pillars]);
  // "Next step" is the top of today's plan: the best task that fits the time you have.
  const next = plan.planned[0] ?? active[0];
  const nextPillar = pillars.find((p) => p.id === next?.pillarId);
  const plannedIds = new Set(plan.planned.map((t) => t.id));
  const rest = active.filter((t) => !plannedIds.has(t.id));

  const overdueCount = active.filter((t) => (daysUntilDue(t.due) ?? 1) < 0).length;
  const quickWins = active.filter((t) => t.estimatedMinutes <= 15).length;
  const totalMinutes = active.reduce((s, t) => s + t.estimatedMinutes, 0);
  const usedPct = Math.min(100, Math.round((plan.totalMinutes / Math.max(1, budgetMinutes)) * 100));

  let elapsed = 0;

  return (
    <section aria-label="Foco de hoy" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        {/* Next task hero */}
        {next ? (
          <div
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
            style={{ boxShadow: `inset 4px 0 0 ${nextPillar?.accentHex || '#0F172A'}` }}
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-10"
              style={{ backgroundColor: nextPillar?.accentHex || '#0F172A' }}
            />
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Target className="h-3.5 w-3.5" />
              Tu siguiente paso
            </div>
            <div className="mt-3 flex items-start gap-4 sm:gap-6">
              <ScoreRing score={next.priorityScore} size={76} stroke={6} />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-bold leading-tight text-slate-900 sm:text-2xl" style={{ textWrap: 'balance' }}>
                  {next.cleanTitle}
                </h2>
                {next.cleanNotes && <p className="mt-1 text-sm text-slate-600">{next.cleanNotes}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <PillarTag pillar={nextPillar} />
                  <DueChip due={next.due} />
                  <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                    {formatMinutes(next.estimatedMinutes)}
                  </span>
                  <span className="text-[11px] text-slate-400">{next.listTitle}</span>
                </div>
                {next.reasons && next.reasons.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {next.reasons.map((r) => (
                      <li key={r} className="rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 max-w-md">
                  <ScoreBreakdownBar breakdown={next.breakdown} showLegend />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => actions.onToggle(next)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Listo, la terminé
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.onEdit(next)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Ajustar prioridad
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-emerald-500" />
            <p className="mt-2 font-display text-lg font-semibold text-slate-900">No hay tareas pendientes</p>
            <p className="text-sm text-slate-500">Agregá una arriba o cambiá los filtros.</p>
          </div>
        )}

        {/* Daily plan */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-slate-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">Plan de hoy</h2>
              <span className="text-xs text-slate-500">¿Cuánto tiempo tenés?</span>
            </div>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tiempo disponible hoy">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={budgetMinutes === b}
                  onClick={() => onBudgetChange(b)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    budgetMinutes === b ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {formatMinutes(b)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {plan.planned.length} {plan.planned.length === 1 ? 'tarea' : 'tareas'} ·{' '}
                <span className="font-mono tabular-nums text-slate-700">{formatMinutes(plan.totalMinutes)}</span> de{' '}
                {formatMinutes(budgetMinutes)}
              </span>
              <span className="font-mono tabular-nums">{usedPct}%</span>
            </div>
            <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
              {plan.planned.map((t) => {
                const p = pillars.find((pp) => pp.id === t.pillarId);
                return (
                  <div
                    key={t.id}
                    title={`${t.cleanTitle} · ${formatMinutes(t.estimatedMinutes)}`}
                    style={{
                      width: `${(t.estimatedMinutes / Math.max(budgetMinutes, plan.totalMinutes)) * 100}%`,
                      backgroundColor: p?.accentHex || '#64748B',
                    }}
                    className="h-full border-r border-white last:border-r-0"
                  />
                );
              })}
            </div>
          </div>

          {plan.mustDoOverflow.length > 0 && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              No te alcanza el tiempo para {plan.mustDoOverflow.length} {plan.mustDoOverflow.length === 1 ? 'tarea vencida o crítica' : 'tareas vencidas o críticas'}:{' '}
              {plan.mustDoOverflow.map((t) => t.cleanTitle).join(', ')}. Considerá mover la fecha o pedir ayuda.
            </p>
          )}

          <ol className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            <AnimatePresence initial={false}>
              {plan.planned.map((task) => {
                const start = elapsed;
                elapsed += task.estimatedMinutes;
                const p = pillars.find((pp) => pp.id === task.pillarId);
                return (
                  <motion.li
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-400">
                      +{Math.floor(start / 60)}:{String(start % 60).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={() => actions.onToggle(task)}
                      aria-label={`Completar '${task.cleanTitle}'`}
                      className="h-4 w-4 shrink-0 rounded-full border-2 transition-colors hover:bg-emerald-100"
                      style={{ borderColor: p?.accentHex || '#94A3B8' }}
                    />
                    <button
                      type="button"
                      onClick={() => actions.onEdit(task)}
                      className={`min-w-0 flex-1 truncate text-left text-sm hover:underline ${
                        task.id === next?.id ? 'font-semibold text-slate-900' : 'text-slate-800'
                      }`}
                    >
                      {task.cleanTitle}
                    </button>
                    <span className="hidden sm:inline-flex">
                      <DueChip due={task.due} />
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-500">
                      {formatMinutes(task.estimatedMinutes)}
                    </span>
                    <ScoreRing score={task.priorityScore} size={30} stroke={3} />
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </div>

        {/* Rest of the ranking */}
        {rest.length > 0 && (
          <div>
            <h2 className="mb-3 font-display text-base font-semibold text-slate-900">
              No entran hoy <span className="text-sm font-normal text-slate-500">· {rest.length} en cola, ordenadas por prioridad</span>
            </h2>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {rest.map((task) => (
                  <motion.div key={task.id} layout exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <TaskCard task={task} pillars={pillars} {...actions} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="space-y-4 lg:col-span-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Pendientes', value: active.length, tone: 'text-slate-900' },
            { label: 'Vencidas', value: overdueCount, tone: overdueCount ? 'text-red-600' : 'text-slate-900' },
            { label: 'Rápidas (≤15 min)', value: quickWins, tone: 'text-emerald-700' },
            { label: 'Carga total', value: formatMinutes(totalMinutes), tone: 'text-slate-900' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="text-[11px] font-medium text-slate-500">{s.label}</div>
              <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900">
            <Lightbulb className="h-4 w-4 text-amber-500" /> Sugerencias
          </h2>
          <ul className="mt-3 space-y-2">
            {insights.map((insight) => {
              const style = INSIGHT_STYLE[insight.tone];
              const Icon = style.icon;
              return (
                <li key={insight.id}>
                  <button
                    type="button"
                    disabled={!insight.pillarId}
                    onClick={() => insight.pillarId && onSelectPillar(insight.pillarId)}
                    className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-left ${style.className} ${
                      insight.pillarId ? 'hover:brightness-95' : 'cursor-default'
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="block text-xs font-semibold">{insight.title}</span>
                      <span className="mt-0.5 block text-xs opacity-80">{insight.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <h2 className="font-display text-sm font-semibold text-slate-900">Cómo se calcula el puntaje</h2>
          <p className="mt-1.5">Cada tarea suma hasta 100 puntos en cuatro factores:</p>
          <ul className="mt-2 space-y-1">
            <li><strong className="text-slate-900">Importancia (40)</strong>: peso del área de vida × impacto.</li>
            <li><strong className="text-red-600">Urgencia (35)</strong>: sube a medida que se acerca la fecha; vencida = máximo.</li>
            <li><strong className="text-amber-600">Antigüedad (15)</strong>: lo que espera hace mucho no se olvida.</li>
            <li><strong className="text-emerald-700">Rapidez (10)</strong>: lo corto se hace primero cuando empata.</li>
          </ul>
        </div>
      </aside>
    </section>
  );
};
