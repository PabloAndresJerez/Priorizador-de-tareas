import React from 'react';
import type { ScoreBreakdown } from '../utils/priorityEngine';
import { BREAKDOWN_META, scoreColor } from './taskUi';

export const ScoreRing: React.FC<{ score: number; size?: number; stroke?: number }> = ({
  score,
  size = 44,
  stroke = 4,
}) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const color = scoreColor(clamped);
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      title={`Índice de prioridad: ${clamped}/100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 300ms ease, stroke 300ms ease' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono font-bold tabular-nums"
        style={{ color, fontSize: size * 0.3 }}
      >
        {clamped}
      </span>
    </div>
  );
};

/** Stacked bar showing which factors produced the score. */
export const ScoreBreakdownBar: React.FC<{ breakdown?: ScoreBreakdown; showLegend?: boolean }> = ({
  breakdown,
  showLegend = false,
}) => {
  if (!breakdown) return null;
  const tooltip = BREAKDOWN_META.map((m) => `${m.label}: ${breakdown[m.key]} pts`).join(' · ');
  return (
    <div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100" title={tooltip}>
        {BREAKDOWN_META.map((m) =>
          breakdown[m.key] > 0 ? (
            <div
              key={m.key}
              style={{ width: `${breakdown[m.key]}%`, backgroundColor: m.color }}
              className="h-full transition-all duration-300"
            />
          ) : null
        )}
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {BREAKDOWN_META.map((m) => (
            <span key={m.key} className="inline-flex items-center gap-1" title={m.hint}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
              {m.label}
              <span className="font-mono tabular-nums text-slate-700">
                {breakdown[m.key]}/{m.max}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
