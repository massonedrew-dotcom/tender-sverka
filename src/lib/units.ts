// Нормализация единиц и детерминированное сравнение чисел (ТЗ 4.2, 6: «числа — правилами в коде»)
import type { Operator, Requirement, Status } from '../types'

type Dim = 'mass' | 'length' | 'power' | 'data' | 'freq' | 'time' | 'temp' | 'volt' | 'current' | 'volume' | 'pressure' | 'count' | 'percent' | 'area' | 'energy' | 'speed' | 'datarate' | 'luminance' | 'money' | 'items' | 'none'

interface UnitDef { dim: Dim; f: number; offset?: number }

const U: Record<string, UnitDef> = {}
const add = (names: string[], d: UnitDef) => names.forEach((n) => (U[n] = d))

add(['мг', 'mg'], { dim: 'mass', f: 0.001 })
add(['г', 'гр', 'g', 'gr', 'gramm', 'грамм'], { dim: 'mass', f: 1 })
add(['кг', 'kg', 'килограмм', 'kilogramm'], { dim: 'mass', f: 1000 })
add(['т', 'тонна', 'тонн', 't', 'tonna', 'ton', 'tons'], { dim: 'mass', f: 1e6 })
add(['мм', 'mm', 'миллиметр', 'millimetr'], { dim: 'length', f: 1 })
add(['см', 'cm', 'сантиметр', 'santimetr'], { dim: 'length', f: 10 })
add(['дм', 'dm'], { dim: 'length', f: 100 })
add(['м', 'm', 'метр', 'metr', 'meter', 'metre'], { dim: 'length', f: 1000 })
add(['км', 'km'], { dim: 'length', f: 1e6 })
add(['дюйм', 'дюйма', 'дюймов', 'inch', 'inches', 'in', '"', '″', 'dyuym'], { dim: 'length', f: 25.4 })
add(['мвт', 'mw'], { dim: 'power', f: 1e6 })
add(['вт', 'w', 'ватт', 'vatt', 'watt'], { dim: 'power', f: 1 })
add(['квт', 'kw', 'киловатт', 'kilovatt'], { dim: 'power', f: 1000 })
add(['ва', 'va'], { dim: 'power', f: 1 })
add(['ква', 'kva'], { dim: 'power', f: 1000 })
add(['л.с.', 'лс', 'hp'], { dim: 'power', f: 735.5 })
add(['кб', 'kb', 'кбайт'], { dim: 'data', f: 1 / 1024 / 1024 })
add(['мб', 'mb', 'мбайт', 'megabayt'], { dim: 'data', f: 1 / 1024 })
add(['гб', 'gb', 'гбайт', 'гигабайт', 'gigabayt', 'gigabyte', 'gib'], { dim: 'data', f: 1 })
add(['тб', 'tb', 'тбайт', 'терабайт', 'terabayt', 'terabyte', 'tib'], { dim: 'data', f: 1024 })
add(['гц', 'hz', 'gs'], { dim: 'freq', f: 1 })
add(['кгц', 'khz'], { dim: 'freq', f: 1e3 })
add(['мгц', 'mhz'], { dim: 'freq', f: 1e6 })
add(['ггц', 'ghz'], { dim: 'freq', f: 1e9 })
add(['ч', 'час', 'часа', 'часов', 'h', 'hour', 'hours', 'soat'], { dim: 'time', f: 1 / 24 / 30 })
add(['дн', 'день', 'дня', 'дней', 'сут', 'суток', 'day', 'days', 'kun', 'кун'], { dim: 'time', f: 1 / 30 })
add(['кал.дн', 'календарных дней', 'рабочих дней', 'раб.дн'], { dim: 'time', f: 1 / 30 })
add(['нед', 'неделя', 'недели', 'недель', 'week', 'weeks', 'hafta'], { dim: 'time', f: 7 / 30 })
add(['мес', 'месяц', 'месяца', 'месяцев', 'month', 'months', 'oy', 'ой'], { dim: 'time', f: 1 })
add(['г.', 'год', 'года', 'лет', 'year', 'years', 'yil', 'йил'], { dim: 'time', f: 12 })
add(['°c', 'c', '℃', 'градус', 'градусов'], { dim: 'temp', f: 1, offset: 0 })
add(['°f', 'f', '℉'], { dim: 'temp', f: 5 / 9, offset: -32 })
add(['k', 'кельвин'], { dim: 'temp', f: 1, offset: -273.15 })
add(['в', 'v', 'вольт', 'volt'], { dim: 'volt', f: 1 })
add(['кв', 'kv'], { dim: 'volt', f: 1000 })
add(['мв', 'mv'], { dim: 'volt', f: 0.001 })
add(['а', 'a', 'ампер', 'amper'], { dim: 'current', f: 1 })
add(['ма', 'ma'], { dim: 'current', f: 0.001 })
add(['мач', 'mah', 'мa·ч'], { dim: 'energy', f: 1 })
add(['вт·ч', 'втч', 'wh', 'вт*ч'], { dim: 'energy', f: 1000 })
add(['мл', 'ml'], { dim: 'volume', f: 0.001 })
add(['л', 'l', 'литр', 'litr', 'liter'], { dim: 'volume', f: 1 })
add(['м3', 'м³', 'm3', 'm³', 'куб.м'], { dim: 'volume', f: 1000 })
add(['па', 'pa'], { dim: 'pressure', f: 1 })
add(['кпа', 'kpa'], { dim: 'pressure', f: 1e3 })
add(['мпа', 'mpa'], { dim: 'pressure', f: 1e6 })
add(['бар', 'bar'], { dim: 'pressure', f: 1e5 })
add(['атм', 'atm'], { dim: 'pressure', f: 101325 })
add(['м2', 'м²', 'm2', 'm²', 'кв.м'], { dim: 'area', f: 1 })
add(['км/ч', 'km/h'], { dim: 'speed', f: 1 })
add(['мбит/с', 'mbps', 'мбит', 'mbit/s'], { dim: 'datarate', f: 1 })
add(['гбит/с', 'gbps', 'гбит', 'gbit/s'], { dim: 'datarate', f: 1000 })
add(['кд/м2', 'кд/м²', 'нит', 'nit', 'nits', 'cd/m2', 'cd/m²'], { dim: 'luminance', f: 1 })
add(['шт', 'шт.', 'pcs', 'pc', 'dona', 'единиц', 'ед', 'ед.', 'комплект', 'компл', 'set', 'units'], { dim: 'count', f: 1 })
// Документы и люди: «2 из 3» — частичное выполнение (ТЗ, раздел 6)
add(['договор', 'договора', 'договоров', 'contracts', 'contract', 'shartnoma', 'сертификат', 'сертификата', 'сертификатов', 'certificates', 'чел', 'человек', 'специалист', 'специалиста', 'специалистов', 'инженер', 'инженера', 'инженеров', 'engineers', 'mutaxassis', 'документ', 'документа', 'документов'], { dim: 'items', f: 1 })
add(['ядер', 'ядра', 'ядро', 'cores', 'core', 'yadro', 'потоков', 'threads'], { dim: 'count', f: 1 })
add(['сум', 'сўм', "so'm", 'som', 'uzs'], { dim: 'money', f: 1 })
add(['тыс. сум', 'тыс.сум', 'тыс сум', "ming so'm"], { dim: 'money', f: 1e3 })
add(['млн сум', 'млн. сум', "mln so'm"], { dim: 'money', f: 1e6 })
add(['млрд сум', 'млрд. сум', "mlrd so'm"], { dim: 'money', f: 1e9 })
add(['%', 'процент', 'процентов', 'percent', 'foiz'], { dim: 'percent', f: 1 })

/**
 * Извлекает первое число из строки. Понимает пробелы-разделители тысяч («7 200 000»),
 * десятичную запятую («1,79»), формы «5,000,000» и «1.234,56».
 */
export function parseNumber(s?: string | number | null): number | null {
  if (s === undefined || s === null) return null
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const m = String(s)
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .match(/-?(?:\d{1,3}(?: \d{3}(?!\d))+|\d+)(?:[.,]\d+)*/)
  if (!m) return null
  let t = m[0].replace(/ /g, '')
  const seps = t.match(/[.,]/g) ?? []
  if (seps.length) {
    const last = seps[seps.length - 1]
    if (seps.some((c) => c !== last)) {
      // «1.234,56» / «1,234.56»: последний знак — десятичный, остальные — разделители тысяч
      const other = last === ',' ? '.' : ','
      t = t.split(other).join('').replace(last, '.')
    } else if (seps.length > 1) t = t.split(last).join('') // «5,000,000»
    else t = t.replace(last, '.')
  }
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : null
}

const normUnit = (unit: string) => unit.trim().toLowerCase().replace(/\s+/g, ' ')

export function unitDef(unit?: string): UnitDef | null {
  if (!unit) return null
  const raw = normUnit(unit)
  // сначала точное совпадение: «г.» — год, «г» — грамм
  if (U[raw]) return U[raw]
  const u = raw.replace(/\.$/, '')
  return U[u] ?? U[u + '.'] ?? U[u.replace(/\s/g, '')] ?? null
}

/** Приводит значение к базовой единице измерения. */
export function toBase(value: number, unit?: string): { v: number; dim: Dim } {
  const d = unitDef(unit)
  if (!d) return { v: value, dim: 'none' }
  if (d.dim === 'temp') return { v: (value + (d.offset ?? 0)) * d.f, dim: 'temp' }
  return { v: value * d.f, dim: d.dim }
}

export const NUMERIC_OPS: Operator[] = ['>=', '<=', '=', 'range', 'tolerance']

export interface RuleResult {
  /** true — выполняется, false — не выполняется, null — нельзя сравнить кодом */
  pass: boolean | null
  exceeds?: boolean
  /** Выполнена часть количественного условия (2 из 3 договоров) */
  partial?: boolean
  note: string
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString()

/** Детерминированное сравнение «условие требования» ↔ «значение из заявки». */
export function compareNumeric(req: Requirement, claimedValue?: string, claimedUnit?: string): RuleResult {
  if (!NUMERIC_OPS.includes(req.operator)) return { pass: null, note: '' }
  const rv = parseNumber(req.value)
  const cv = parseNumber(claimedValue)
  if (rv === null || cv === null) return { pass: null, note: 'нет числового значения для сравнения' }
  // Единица есть только с одной стороны: досчитываем лишь безразмерные количества (шт, договоры, ядра),
  // иначе «16» без единицы против «16 МБ» сравнивать нельзя
  if (!req.unit !== !claimedUnit) {
    const d = unitDef(req.unit || claimedUnit)
    if (!d || (d.dim !== 'count' && d.dim !== 'items'))
      return { pass: null, note: `единица указана только с одной стороны: ${req.unit || '—'} / ${claimedUnit || '—'}` }
  }
  const ru = req.unit || claimedUnit
  const cu = claimedUnit || req.unit
  const a = toBase(rv, ru)
  const b = toBase(cv, cu)
  const dRu = unitDef(ru)
  const dCu = unitDef(cu)
  if (dRu && dCu && dRu.dim !== dCu.dim) return { pass: null, note: `несопоставимые единицы: ${ru} / ${cu}` }
  if (!dRu !== !dCu && ru && cu && normUnit(ru) !== normUnit(cu))
    return { pass: null, note: `неизвестная единица: ${dRu ? cu : ru}` }
  // обе единицы неизвестны и различаются — сравнивать числа «в лоб» нельзя
  if (!dRu && !dCu && ru && cu && normUnit(ru).replace(/\.$/, '') !== normUnit(cu).replace(/\.$/, ''))
    return { pass: null, note: `несопоставимые единицы: ${ru} / ${cu}` }
  const eps = Math.abs(a.v) * 1e-9 + 1e-12
  const left = `${cv} ${cu ?? ''}`.trim()
  switch (req.operator) {
    case '>=': {
      const pass = b.v + eps >= a.v
      const partial = !pass && (a.dim === 'items' || b.dim === 'items') && b.v > 0
      return { pass, partial, exceeds: b.v > a.v + eps, note: `${left} ${pass ? '≥' : '<'} ${rv} ${ru ?? ''}${partial ? ' (частично)' : ''}`.trim() }
    }
    case '<=': {
      const pass = b.v <= a.v + eps
      return { pass, exceeds: b.v < a.v - eps, note: `${left} ${pass ? '≤' : '>'} ${rv} ${ru ?? ''}`.trim() }
    }
    case '=': {
      const pass = Math.abs(b.v - a.v) <= eps
      return { pass, note: `${left} ${pass ? '=' : '≠'} ${rv} ${ru ?? ''}`.trim() }
    }
    case 'range': {
      const mx = parseNumber(req.valueMax)
      if (mx === null) return { pass: null, note: 'не задана верхняя граница диапазона' }
      const hi = toBase(mx, ru).v
      const pass = b.v + eps >= a.v && b.v <= hi + eps
      return { pass, note: `${left} ${pass ? '∈' : '∉'} [${rv}; ${mx}] ${ru ?? ''}`.trim() }
    }
    case 'tolerance': {
      const tol = parseNumber(req.valueMax)
      if (tol === null) return { pass: null, note: 'не задан допуск' }
      const t = toBase(tol, ru).v - toBase(0, ru).v
      const pass = Math.abs(b.v - a.v) <= Math.abs(t) + eps
      return { pass, note: `${left} ${pass ? 'в пределах' : 'вне'} ${rv} ± ${fmt(tol)} ${ru ?? ''}`.trim() }
    }
  }
  return { pass: null, note: '' }
}

/** Применяет правила кода к статусу, предложенному LLM. */
export function applyRule(req: Requirement, llmStatus: Status, confirmed: boolean, claimedValue?: string, claimedUnit?: string): { status: Status; rule?: RuleResult } {
  const r = compareNumeric(req, claimedValue, claimedUnit)
  if (r.pass === null) return { status: llmStatus }
  if (!r.pass) return { status: r.partial ? 'partial' : 'fail', rule: r }
  // Число проходит, но модель сочла пункт невыполненным / спорным (другая позиция лота, «или эквивалент»,
  // противоречие документов) — не поднимаем до «ok», отдаём человеку (ТЗ 12: 0 ложных «Соответствует»)
  if (llmStatus === 'review' || llmStatus === 'fail')
    return { status: 'review', rule: { ...r, note: `${r.note}; число проходит, но AI отметил пункт как ${llmStatus === 'fail' ? 'несоответствие' : 'спорный'} — нужна проверка` } }
  // число проходит — статус зависит от подтверждения документом
  if (llmStatus === 'partial' || llmStatus === 'unconfirmed') return { status: llmStatus, rule: r }
  return { status: confirmed ? 'ok' : 'unconfirmed', rule: r }
}

export function opSymbol(op: Operator): string {
  return { '>=': '≥', '<=': '≤', '=': '=', range: '∈', tolerance: '±', exists: '✓', text: '≈', date: '📅' }[op]
}

export function reqCondition(r: Requirement): string {
  const u = r.unit ? ' ' + r.unit : ''
  switch (r.operator) {
    case '>=':
    case '<=':
    case '=':
      return r.value ? `${opSymbol(r.operator)} ${r.value}${u}` : ''
    case 'range':
      return `${r.value}–${r.valueMax}${u}`
    case 'tolerance':
      return `${r.value} ± ${r.valueMax}${u}`
    default:
      return r.value ? r.value + u : ''
  }
}
