import { addDays, localDateToYmd } from './dates';
import {
  type ImpactLevel,
  type PriorityPillar,
  type UrgencyLevel,
  findPillarByLabel,
  inferImpactFromText,
  inferPillarFromText,
  inferUrgencyFromDue,
  normalizeText,
} from './priorityEngine';

export interface QuickAddDraft {
  title: string;
  pillarId: string;
  pillarExplicit: boolean;
  urgency: UrgencyLevel;
  impact: ImpactLevel;
  estimatedMinutes: number;
  dueYmd?: string;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const URGENCY_TOKENS: Record<string, UrgencyLevel> = {
  '!!!': 'critical',
  '!!': 'high',
  '!': 'medium',
  '!critica': 'critical',
  '!urgente': 'critical',
  '!alta': 'high',
  '!media': 'medium',
  '!baja': 'low',
};

const IMPACT_TOKENS: Record<string, ImpactLevel> = {
  '*alto': 'high',
  '*medio': 'medium',
  '*bajo': 'low',
  '***': 'high',
  '**': 'medium',
  '*': 'low',
};

/**
 * Understands lines such as:
 *   "Pagar tarjeta mañana 15m #finanzas !alta"
 *   "Turno dentista el viernes 1h"
 *   "Entregar propuesta 28/10 !!! *alto"
 * Recognized pieces are removed from the title; anything left is the task name.
 */
export function parseQuickAdd(
  input: string,
  pillars: PriorityPillar[],
  nowMs = Date.now(),
  listTitle = ''
): QuickAddDraft {
  let text = ` ${input.trim()} `;
  const today = new Date(nowMs);
  let dueDate: Date | undefined;
  let pillarId: string | undefined;
  let urgency: UrgencyLevel | undefined;
  let impact: ImpactLevel | undefined;
  let minutes: number | undefined;

  const take = (regex: RegExp, handler: (m: RegExpExecArray) => boolean | void) => {
    const m = regex.exec(text);
    if (m && handler(m) !== false) {
      text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    }
  };

  // #pilar
  take(/\s#([\p{L}\d_-]+)/u, (m) => {
    const found = findPillarByLabel(m[1], pillars);
    if (!found) return false;
    pillarId = found.id;
  });

  // !urgencia
  take(/\s(!{1,3}|![\p{L}]+)(?=\s)/u, (m) => {
    const level = URGENCY_TOKENS[normalizeText(m[1])];
    if (!level) return false;
    urgency = level;
  });

  // *impacto
  take(/\s(\*{1,3}|\*[\p{L}]+)(?=\s)/u, (m) => {
    const level = IMPACT_TOKENS[normalizeText(m[1])];
    if (!level) return false;
    impact = level;
  });

  // Duración: 1h30, 1h, 45m, 45 min, 2 horas
  take(/\s(\d+)\s?h\s?(\d{1,2})(?:m|min)?(?=\s)/i, (m) => {
    minutes = Number(m[1]) * 60 + Number(m[2]);
  });
  if (minutes === undefined) {
    take(/\s(\d+(?:[.,]\d+)?)\s?(?:h|hs|hora|horas)(?=\s)/i, (m) => {
      minutes = Math.round(parseFloat(m[1].replace(',', '.')) * 60);
    });
  }
  if (minutes === undefined) {
    take(/\s(\d+)\s?(?:m|min|mins|minutos)(?=\s)/i, (m) => {
      minutes = Math.max(5, Number(m[1]));
    });
  }

  // Fechas
  take(/\s(?:para\s)?pasado\s+mañana(?=\s)/i, () => {
    dueDate = addDays(today, 2);
  });
  if (!dueDate)
    take(/\s(?:para\s)?(hoy|mañana|manana)(?=\s)/i, (m) => {
      dueDate = addDays(today, normalizeText(m[1]) === 'hoy' ? 0 : 1);
    });
  if (!dueDate)
    take(/\sen\s(\d{1,2})\s(d[ií]as?|semanas?)(?=\s)/i, (m) => {
      const n = Number(m[1]);
      dueDate = addDays(today, normalizeText(m[2]).startsWith('semana') ? n * 7 : n);
    });
  if (!dueDate)
    take(/\s(?:la\s)?(?:pr[oó]xima\s+semana|semana\s+que\s+viene)(?=\s)/i, () => {
      // Next Monday
      const offset = ((8 - today.getDay()) % 7) || 7;
      dueDate = addDays(today, offset);
    });
  if (!dueDate)
    take(/\s(?:el\s|este\s|para\sel\s)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?=\s)/i, (m) => {
      const target = WEEKDAYS.indexOf(normalizeText(m[1]));
      let offset = (target - today.getDay() + 7) % 7;
      if (offset === 0) offset = 7;
      dueDate = addDays(today, offset);
    });
  if (!dueDate)
    take(/\s(?:el\s|para\sel\s)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/, (m) => {
      const day = Number(m[1]);
      const month = Number(m[2]) - 1;
      if (day < 1 || day > 31 || month < 0 || month > 11) return false;
      let year = m[3] ? Number(m[3]) : today.getFullYear();
      if (year < 100) year += 2000;
      let candidate = new Date(year, month, day);
      if (!m[3] && candidate < addDays(today, 0)) candidate = new Date(year + 1, month, day);
      dueDate = candidate;
    });

  const title = text.replace(/\s+/g, ' ').trim();
  const dueYmd = dueDate ? localDateToYmd(dueDate) : undefined;

  return {
    title,
    pillarId: pillarId || inferPillarFromText(title, pillars, listTitle),
    pillarExplicit: Boolean(pillarId),
    urgency: urgency || inferUrgencyFromDue(dueYmd ? `${dueYmd}T00:00:00.000Z` : undefined, title),
    impact: impact || inferImpactFromText(title),
    estimatedMinutes: minutes ?? 30,
    dueYmd,
  };
}
