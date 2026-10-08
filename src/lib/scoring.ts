// Скоринг: процент соответствия (ТЗ, раздел 7)
import type { Match, Participant, Project, Requirement, Settings, Status, Verdict } from '../types'

export const DEFAULT_WEIGHTS = { mandatory: 3, scored: 2, desired: 1 }
export const DEFAULT_K = { ok: 1, partial: 0.5, unconfirmed: 0.3, fail: 0 }

export interface Score {
  score: number
  scoreMin: number
  scoreMax: number
  product: number
  participant: number
  byCategory: { category: string; score: number; total: number }[]
  mandatoryOk: number
  mandatoryTotal: number
  counts: Record<Status, number>
  problems: number
  verdict: Verdict
  forecast: number
  total: number
}

export function weightOf(r: Requirement, s: Pick<Settings, 'weights'>): number {
  if (r.type === 'scored' && r.points && r.points > 0) return r.points
  return s.weights[r.type] ?? 1
}

/** Пункт без результата сверки (ещё не проверен, например добавлен разъяснением) — «Требует проверки», а не «Не соответствует». */
const statusOf = (m?: Match): Status => m?.status ?? 'review'

function pct(items: { r: Requirement; m?: Match }[], s: Pick<Settings, 'weights' | 'k'>, reviewAs: 'skip' | 0 | 1 = 'skip'): number {
  let num = 0
  let den = 0
  for (const { r, m } of items) {
    const st = statusOf(m)
    const w = weightOf(r, s)
    if (st === 'review') {
      if (reviewAs === 'skip') continue
      num += w * reviewAs
      den += w
      continue
    }
    num += w * s.k[st]
    den += w
  }
  return den ? (num / den) * 100 : 0
}

export function activeReqs(p: Project): Requirement[] {
  return p.requirements.filter((r) => !r.excluded)
}

export function computeScore(p: Project, part: Participant, s: Pick<Settings, 'weights' | 'k'>, overrides?: Record<string, Status>): Score {
  const reqs = activeReqs(p)
  const items = reqs.map((r) => {
    const m = part.matches[r.id]
    if (overrides?.[r.id] && m) return { r, m: { ...m, status: overrides[r.id] } }
    return { r, m }
  })
  const counts: Record<Status, number> = { ok: 0, partial: 0, unconfirmed: 0, fail: 0, review: 0 }
  let mandatoryOk = 0
  let mandatoryTotal = 0
  let mandatoryFail = 0
  for (const { r, m } of items) {
    const st = statusOf(m)
    counts[st]++
    if (r.type === 'mandatory') {
      mandatoryTotal++
      if (st === 'ok') mandatoryOk++
      if (st === 'fail') mandatoryFail++
    }
  }
  const cats = Array.from(new Set(reqs.map((r) => r.category)))
  const byCategory = cats.map((c) => {
    const it = items.filter((x) => x.r.category === c)
    return { category: c, score: pct(it, s), total: it.length }
  })
  // ТЗ 7: любое невыполненное обязательное требование → «Риск отклонения» независимо от процента;
  // «Готова к подаче» — все обязательные зелёные
  let verdict: Verdict = 'needs_work'
  if (mandatoryFail > 0) verdict = 'risk'
  else if (items.length > 0 && mandatoryOk === mandatoryTotal) verdict = 'ready'

  // Прогноз: все устранимые проблемы закрыты
  let forecast = 0
  if (!overrides) {
    const ov: Record<string, Status> = {}
    for (const { r, m } of items) {
      if (!m || m.status === 'ok') continue
      if (m.recommendation?.actionType === 'unfixable') continue
      ov[r.id] = 'ok'
    }
    forecast = computeScore(p, part, s, ov).score
  }

  return {
    score: pct(items, s),
    scoreMin: pct(items, s, 0),
    scoreMax: pct(items, s, 1),
    product: pct(items.filter((x) => x.r.scope === 'product'), s),
    participant: pct(items.filter((x) => x.r.scope === 'participant'), s),
    byCategory,
    mandatoryOk,
    mandatoryTotal,
    counts,
    problems: items.length - counts.ok,
    verdict,
    forecast,
    total: items.length,
  }
}

/** Влияние устранения пункта на итоговый % */
export function impactOf(p: Project, part: Participant, reqId: string, s: Pick<Settings, 'weights' | 'k'>): number {
  const base = computeScore(p, part, s, {}).score
  const after = computeScore(p, part, s, { [reqId]: 'ok' }).score
  return Math.round((after - base) * 10) / 10
}

export const r1 = (n: number) => Math.round(n * 10) / 10
export const r0 = (n: number) => Math.round(n)
