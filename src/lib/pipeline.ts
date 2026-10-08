// AI-конвейер: извлечение требований → разбор заявки → сопоставление → вывод (ТЗ, разделы 4–8)
import type {
  ActionType, Analysis, Contradiction, DocFile, Fact, Lang, Match, Operator, Participant, Project, Question, ReqType,
  Requirement, Scope, Settings, SourceRef, Status, Version,
} from '../types'
import { callJSON, callLLM, pool } from './llm'
import { chunkFiles, locateQuote, norm, packText, uid } from './text'
import { applyRule, reqCondition } from './units'
import { computeScore, impactOf } from './scoring'

export type Progress = (stage: string, detail?: string) => void

const LANG_NAME: Record<Lang, string> = { ru: 'русском', uz: "узбекском (латиница, o'zbek tili)", en: 'английском' }

export const PRODUCT_CATS = ['Технические характеристики', 'Стандарты и сертификаты', 'Поставка и сроки', 'Гарантия и сервис', 'Упаковка и маркировка', 'Комплектность и документация', 'Коммерческие условия']
export const PARTICIPANT_CATS = ['Правоспособность и регистрация', 'Квалификация и лицензии', 'Опыт', 'Финансовая устойчивость', 'Ресурсы и специалисты', 'Обеспечение', 'Оформление заявки']

const OPS: Operator[] = ['>=', '<=', '=', 'range', 'tolerance', 'exists', 'text', 'date']
const TYPES: ReqType[] = ['mandatory', 'scored', 'desired']
const STATUSES: Status[] = ['ok', 'partial', 'unconfirmed', 'fail', 'review']
const ACTIONS: ActionType[] = ['add_doc', 'fix_data', 'replace_product', 'ask_customer', 'unfixable']

const str = (x: unknown) => (x === null || x === undefined ? '' : String(x)).trim()
const num = (x: unknown, d: number) => (Number.isFinite(Number(x)) ? Number(x) : d)
const pick = <T extends string>(x: unknown, list: T[], d: T): T => (list.includes(x as T) ? (x as T) : d)

// ------------------------------------------------------------------
// 1. Извлечение требований заказчика
// ------------------------------------------------------------------

const EXTRACT_SYSTEM = (lang: Lang, deadline: string) => `Ты — ведущий эксперт по государственным и корпоративным закупкам Республики Узбекистан (ЗРУ-684 «О государственных закупках», площадки xarid.uz, etender.uzex.uz, а также процедуры Всемирного банка/АБР). Ты извлекаешь из закупочной документации ВСЕ требования к товару (работе, услуге) и к участнику и превращаешь их в структурированный чек-лист.

Правила:
1. Каждое требование атомарно: одно условие = одна запись. «ОЗУ не менее 16 ГБ, SSD не менее 512 ГБ» — это ДВЕ записи.
2. Извлекай только требования, а не справочный текст (преамбулы, цитаты закона, инструкции площадки).
3. type: "mandatory" — обязательное («должен», «обязательно», «не допускается», «не менее», отсутствие ведёт к отклонению); "scored" — оценочное (даёт баллы по критериям оценки, укажи points если есть); "desired" — желательное.
4. operator: ">=" (не менее), "<=" (не более), "=" (равно), "range" (диапазон value..valueMax), "tolerance" (value ± valueMax), "exists" (наличие документа/свойства), "text" (смысловое требование), "date" (срок/дата). value — только число для числовых условий (без единиц), unit — единица измерения отдельно.
5. Раскрывай ссылки («согласно Приложению 3», «по форме №2», «см. п. 4.2.1») — собирай требование целиком, указывай основное место.
6. quote — ДОСЛОВНАЯ цитата из текста (до 300 символов) на языке оригинала, без изменений. Требование без цитаты не допускается. fileName и page — точно из маркеров «--- [имя файла, стр. N] ---».
7. Если исходник не на ${LANG_NAME[lang]} языке — дай перевод цитаты в translation.
8. Поля parameter, proof, consequence, category пиши на ${LANG_NAME[lang]} языке.
9. category для товара — одно из: ${PRODUCT_CATS.join('; ')}. Для участника — одно из: ${PARTICIPANT_CATS.join('; ')}.
10. lotItem — позиция лота для многопозиционных лотов («Поз. 1 «Ноутбук»»), иначе пусто.
11. В questions выноси: противоречия внутри документации (ТЗ «гарантия 24 мес», договор «12 мес») — kind "contradiction"; неоднозначности — "ambiguity"; ограничение конкуренции (товарный знак без «или эквивалент», параметры одного производителя) — "restrictive". Также пометь такие требования полем restrictive (краткое пояснение).
12. Нормализуй синонимы параметров («мощность» = «quvvat» = «power»), языки: узбекский (латиница/кириллица), русский, английский и др.
13. confidence — 0..100, насколько ты уверен в корректности извлечения.
Дата окончания приёма заявок: ${deadline || 'не указана (найди в документации)'}.

Верни JSON:
{"requirements":[{"scope":"product|participant","category":"","lotItem":"","parameter":"","operator":"","value":"","valueMax":"","unit":"","type":"mandatory|scored|desired","points":null,"proof":"чем подтверждается","consequence":"Отклонение|Снижение балла|…","fileName":"","page":1,"clause":"п. 2.3","quote":"","translation":"","restrictive":"","confidence":95}],
"questions":[{"kind":"contradiction|ambiguity|restrictive","text":"","quotes":[{"fileName":"","page":1,"quote":""}]}],
"meta":{"lotNumber":"","customer":"","title":"","deadline":"YYYY-MM-DD или пусто"}}`

interface RawReq {
  scope?: string; category?: string; lotItem?: string; parameter?: string; operator?: string; value?: unknown; valueMax?: unknown; unit?: string
  type?: string; points?: unknown; proof?: string; consequence?: string; fileName?: string; page?: unknown; clause?: string; quote?: string
  translation?: string; restrictive?: string; confidence?: unknown; id?: string; changeNote?: string; action?: string
}
interface RawQ { kind?: string; text?: string; quotes?: { fileName?: string; page?: unknown; quote?: string }[] }
interface ExtractOut { requirements?: RawReq[]; questions?: RawQ[]; meta?: { lotNumber?: string; customer?: string; title?: string; deadline?: string } }

/** ТЗ 3.2: страница-источник распознана OCR с уверенностью ниже 90% — пункт уходит на ручную проверку. */
const OCR_MIN_CONFIDENCE = 90

function lowOcr(files: DocFile[], fileId: string | undefined, page: number): boolean {
  const pg = files.find((f) => f.id === fileId)?.pages.find((x) => x.n === page)
  return !!pg?.ocr && (pg.confidence ?? 0) < OCR_MIN_CONFIDENCE
}

/** Источник требования + проверка цитаты по тексту документов (ТЗ 10). */
function makeSource(r: RawReq, files: DocFile[]): { src: SourceRef; verified: boolean } {
  const src: SourceRef = { fileName: str(r.fileName), page: num(r.page, 1), clause: str(r.clause) || undefined, quote: str(r.quote), translation: str(r.translation) || undefined }
  const loc = locateQuote(files, src)
  if (loc) Object.assign(src, { fileId: loc.fileId, fileName: loc.fileName, page: loc.page })
  return { src, verified: !!loc }
}

/** Уверенность извлечения с учётом проверки цитаты и качества OCR страницы-источника. */
function reqConfidence(raw: unknown, src: SourceRef, verified: boolean, files: DocFile[], threshold: number): number {
  let conf = Math.max(0, Math.min(100, num(raw, 80)))
  if (!verified) conf = Math.min(conf, 40)
  else if (lowOcr(files, src.fileId, src.page)) conf = Math.min(conf, threshold - 1)
  return conf
}

/** «14–15,6» / «14..15,6» в одном поле для диапазона, «220 ± 10» для допуска — раскладываем на value/valueMax. */
function splitValues(operator: Operator, v: unknown, vMax: unknown): { value: string; valueMax: string } {
  let value = str(v)
  let valueMax = str(vMax)
  if ((operator === 'range' || operator === 'tolerance') && !valueMax) {
    const sp = value.match(/^\s*(-?[\d\s.,]+?)\s*(?:–|—|-|\.\.|;|±|\+\/-)\s*(-?[\d\s.,]+)\s*$/)
    if (sp) {
      value = sp[1].trim()
      valueMax = sp[2].trim()
    }
  }
  return { value, valueMax }
}

function toReq(r: RawReq, files: DocFile[], threshold: number): Omit<Requirement, 'id'> {
  const { src, verified } = makeSource(r, files)
  const scope = pick<Scope>(r.scope, ['product', 'participant'], 'product')
  const operator = pick(r.operator, OPS, 'text')
  const { value, valueMax } = splitValues(operator, r.value, r.valueMax)
  return {
    scope,
    category: str(r.category) || (scope === 'product' ? PRODUCT_CATS[0] : PARTICIPANT_CATS[1]),
    lotItem: str(r.lotItem) || undefined,
    parameter: str(r.parameter) || '—',
    operator,
    value: value || undefined,
    valueMax: valueMax || undefined,
    unit: str(r.unit) || undefined,
    type: pick(r.type, TYPES, 'mandatory'),
    points: r.points ? num(r.points, 0) || undefined : undefined,
    proof: str(r.proof) || undefined,
    consequence: str(r.consequence) || undefined,
    source: src,
    confidence: reqConfidence(r.confidence, src, verified, files, threshold),
    quoteVerified: verified,
    // ТЗ 10: требование без подтверждённой цитаты не попадает в чек-лист автоматически
    excluded: !verified,
    restrictive: str(r.restrictive) || undefined,
  }
}

function toQuestion(q: RawQ, files: DocFile[]): Question {
  return {
    id: uid('q'),
    kind: pick(q.kind, ['contradiction', 'ambiguity', 'restrictive'], 'ambiguity'),
    text: str(q.text),
    sources: (q.quotes ?? []).map((x) => {
      const s: SourceRef = { fileName: str(x.fileName), page: num(x.page, 1), quote: str(x.quote) }
      const loc = locateQuote(files, s)
      if (loc) Object.assign(s, { fileId: loc.fileId, fileName: loc.fileName, page: loc.page })
      return s
    }),
  }
}

const dedupeKey = (r: Omit<Requirement, 'id'>) => norm(`${r.scope}|${r.lotItem ?? ''}|${r.parameter}|${r.operator}|${r.value ?? ''}|${r.unit ?? ''}`)

export function assignIds(reqs: Omit<Requirement, 'id'>[], existing: Requirement[] = []): Requirement[] {
  const maxN = (p: string) => existing.filter((r) => r.id.startsWith(p)).reduce((m, r) => Math.max(m, parseInt(r.id.slice(2)) || 0), 0)
  let t = maxN('T-')
  let u = maxN('U-')
  return reqs.map((r) => ({ ...r, id: r.scope === 'product' ? `T-${String(++t).padStart(3, '0')}` : `U-${String(++u).padStart(3, '0')}` }))
}

export async function extractRequirements(p: Project, s: Settings, progress: Progress): Promise<{ requirements: Requirement[]; questions: Question[]; meta: ExtractOut['meta'] }> {
  const files = p.customerFiles
  const chunks = chunkFiles(files)
  if (!chunks.length) throw new Error('Документация заказчика не содержит распознанного текста')
  let done = 0
  progress('stage_extract', `0/${chunks.length}`)
  const outs = await pool(chunks, 3, async (chunk, i) => {
    const r = await callJSON<ExtractOut>(s, {
      system: EXTRACT_SYSTEM(s.reportLang, p.deadline),
      user: `Фрагмент документации ${i + 1} из ${chunks.length}. Извлеки все требования из этого фрагмента.\n${chunk}`,
      maxTokens: 32000,
    })
    progress('stage_extract', `${++done}/${chunks.length}`)
    return r
  })
  progress('stage_verify')
  const seen = new Set<string>()
  const raw: Omit<Requirement, 'id'>[] = []
  const questions: Question[] = []
  let meta: ExtractOut['meta'] = {}
  for (const o of outs) {
    for (const rr of o.requirements ?? []) {
      const r = toReq(rr, files, s.reviewThreshold)
      const k = dedupeKey(r)
      if (seen.has(k)) continue
      seen.add(k)
      raw.push(r)
    }
    for (const q of o.questions ?? []) if (str(q.text)) questions.push(toQuestion(q, files))
    for (const [k, v] of Object.entries(o.meta ?? {})) if (v && !(meta as Record<string, string>)[k]) (meta as Record<string, string>)[k] = v
  }
  raw.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'product' ? -1 : 1))
  const requirements = assignIds(raw)
  // межфрагментные противоречия и дубли
  if (chunks.length > 1 && requirements.length) {
    try {
      const extra = await crossCheck(requirements, s)
      questions.push(...extra.map((q) => toQuestion(q, files)))
    } catch {
      /* не критично */
    }
  }
  return { requirements, questions, meta }
}

async function crossCheck(reqs: Requirement[], s: Settings): Promise<RawQ[]> {
  const compact = reqs.map((r) => ({ id: r.id, p: r.parameter, c: reqCondition(r), f: r.source.fileName, pg: r.source.page, q: r.source.quote.slice(0, 160) }))
  const r = await callJSON<{ questions?: RawQ[] }>(s, {
    system: `Ты проверяешь чек-лист требований тендера на противоречия между разными документами (ТЗ vs проект договора и т.п.). Пиши на ${LANG_NAME[s.reportLang]} языке.`,
    user: `Найди противоречия (одно и то же требование с разными значениями в разных местах) и неоднозначности. Верни JSON {"questions":[{"kind":"contradiction|ambiguity","text":"…с указанием ID пунктов","quotes":[{"fileName":"","page":1,"quote":""}]}]}. Если нет — пустой массив.\n${JSON.stringify(compact)}`,
  })
  return r.questions ?? []
}

const AMEND_SYSTEM = (lang: Lang, deadline: string) => `Ты — эксперт по государственным и корпоративным закупкам Республики Узбекистан. Тебе дают утверждённый чек-лист требований и НОВЫЕ документы заказчика — разъяснения положений закупочной документации или изменения в неё. Определи только те пункты, которые эти документы меняют, отменяют или добавляют.

Правила:
1. action "modify" — пункт с указанным id изменён: заполни ТОЛЬКО изменившиеся поля (остальные оставь пустыми) и changeNote («было … → стало …»).
2. action "remove" — пункт отменён: id и changeNote.
3. action "add" — новое требование: все поля, как в чек-листе; каждое требование атомарно (одно условие = одна запись).
4. quote — ДОСЛОВНАЯ цитата из НОВОГО документа (до 300 символов) на языке оригинала; fileName и page — точно из маркеров «--- [имя файла, стр. N] ---». Изменение без цитаты не принимается.
5. Не трогай пункты, которых новые документы не касаются. Ответ на вопрос участника, не меняющий требование, изменением не является.
6. operator: ">=", "<=", "=", "range", "tolerance", "exists", "text", "date"; value — только число, unit — отдельно; type: "mandatory" | "scored" | "desired".
7. Поля parameter, proof, consequence, category, changeNote пиши на ${LANG_NAME[lang]} языке; если цитата на другом языке — дай translation.
8. Если новые документы создают противоречия или неоднозначности — вынеси их в questions.
Дата окончания приёма заявок: ${deadline || 'не указана'}.

Верни JSON: {"updates":[{"action":"modify|add|remove","id":"","changeNote":"","scope":"product|participant","category":"","lotItem":"","parameter":"","operator":"","value":"","valueMax":"","unit":"","type":"","points":null,"proof":"","consequence":"","fileName":"","page":1,"clause":"","quote":"","translation":"","restrictive":"","confidence":90}],"questions":[{"kind":"contradiction|ambiguity|restrictive","text":"","quotes":[{"fileName":"","page":1,"quote":""}]}]}`

/** Изменение пункта разъяснением: поверх существующего пункта применяются только непустые поля ответа. */
function mergeReq(base: Requirement, u: RawReq, files: DocFile[], threshold: number): Requirement {
  const next: Requirement = { ...base }
  const setStr = (k: 'category' | 'lotItem' | 'parameter' | 'unit' | 'proof' | 'consequence' | 'restrictive', v: unknown) => {
    if (str(v)) next[k] = str(v)
  }
  setStr('category', u.category)
  setStr('lotItem', u.lotItem)
  setStr('parameter', u.parameter)
  setStr('unit', u.unit)
  setStr('proof', u.proof)
  setStr('consequence', u.consequence)
  setStr('restrictive', u.restrictive)
  if (OPS.includes(u.operator as Operator)) next.operator = u.operator as Operator
  if (TYPES.includes(u.type as ReqType)) next.type = u.type as ReqType
  if (num(u.points, 0) > 0) next.points = num(u.points, 0)
  if (str(u.value) || str(u.valueMax)) {
    const { value, valueMax } = splitValues(next.operator, str(u.value) || base.value, u.valueMax)
    next.value = value || undefined
    next.valueMax = valueMax || base.valueMax
  }
  if (str(u.quote)) {
    const { src, verified } = makeSource(u, files)
    next.source = src
    next.quoteVerified = verified
    next.confidence = reqConfidence(u.confidence, src, verified, files, threshold)
  }
  const note = str(u.changeNote) || 'Изменено разъяснением'
  next.changeNote = str(u.quote) && !next.quoteVerified ? `${note} (цитата из разъяснения не найдена в тексте — проверьте)` : note
  return next
}

/** Сценарий 5: разъяснения и изменения документации — обновляем чек-лист и помечаем изменённые пункты. */
export async function applyAmendment(p: Project, newFiles: DocFile[], s: Settings, progress: Progress): Promise<{ requirements: Requirement[]; questions: Question[]; changed: string[] }> {
  const compact = p.requirements.map((r) => ({
    id: r.id, scope: r.scope, category: r.category, lotItem: r.lotItem, parameter: r.parameter, condition: reqCondition(r) || r.value || '',
    type: r.type, excluded: r.excluded || undefined, source: `${r.source.fileName}, стр. ${r.source.page}${r.source.clause ? ', ' + r.source.clause : ''}`,
  }))
  const text = packText(newFiles, 200_000).text
  progress('stage_extract', 'разъяснения')
  const allFiles = [...p.customerFiles, ...newFiles]
  const r = await callJSON<{ updates?: RawReq[]; requirements?: RawReq[]; questions?: RawQ[] }>(s, {
    system: AMEND_SYSTEM(s.reportLang, p.deadline),
    user: `Текущий утверждённый чек-лист:\n${JSON.stringify(compact)}\n\nНОВЫЕ документы (разъяснения / изменения документации):\n${text}`,
    maxTokens: 16000,
  })
  const reqs = p.requirements.map((x) => ({ ...x }))
  const changed: string[] = []
  const added: Omit<Requirement, 'id'>[] = []
  // запасной ключ: часть моделей возвращает список под именем requirements
  for (const u of r.updates ?? r.requirements ?? []) {
    const idx = reqs.findIndex((x) => x.id === str(u.id))
    const act = str(u.action) || (idx >= 0 ? 'modify' : 'add')
    if (act === 'remove' && idx >= 0) {
      reqs[idx].excluded = true
      reqs[idx].changeNote = str(u.changeNote) || 'Отменено разъяснением'
      changed.push(reqs[idx].id)
    } else if (act === 'modify' && idx >= 0) {
      reqs[idx] = mergeReq(reqs[idx], u, allFiles, s.reviewThreshold)
      changed.push(reqs[idx].id)
    } else if ((act === 'add' || act === 'modify') && str(u.parameter)) {
      added.push({ ...toReq(u, allFiles, s.reviewThreshold), changeNote: str(u.changeNote) || 'Добавлено разъяснением' })
    }
  }
  const newOnes = assignIds(added, reqs)
  changed.push(...newOnes.map((x) => x.id))
  return { requirements: [...reqs, ...newOnes], questions: (r.questions ?? []).map((q) => toQuestion(q, allFiles)), changed }
}

// ------------------------------------------------------------------
// 2. Разбор заявки и сопоставление
// ------------------------------------------------------------------

const FACTS_SYSTEM = (lang: Lang) => `Ты разбираешь пакет заявки участника тендера (Узбекистан). Извлеки ЗАЯВЛЕННЫЕ ФАКТЫ, а не требования: о товаре (модель, производитель, страна, фактические характеристики, количество, цена, сроки, гарантия) и об участнике (наименование, ИНН/STIR, дата регистрации, руководитель, лицензии — номер/вид/срок, опыт — договоры/акты/суммы, финансовые показатели, справки).
Контроль документов: срок действия, наличие подписи и печати, совпадение реквизитов участника во всех документах.
Найди ВНУТРЕННИЕ ПРОТИВОРЕЧИЯ заявки (в техпредложении одно значение, в паспорте — другое; разные модели в разных документах; разные реквизиты).
Цитаты — дословно на языке оригинала; описания — на ${LANG_NAME[lang]} языке.
Верни JSON: {"participantName":"","inn":"","facts":[{"scope":"product|participant","category":"","parameter":"","value":"","fileName":"","page":1,"quote":""}],"contradictions":[{"text":"","quotes":[{"fileName":"","page":1,"quote":""}]}]}`

const MATCH_SYSTEM = (lang: Lang, deadline: string, threshold: number) => `Ты — эксперт тендерной комиссии (Узбекистан). Для каждого требования заказчика найди в пакете заявки участника подтверждение и выставь статус.

Статусы:
- "ok" — значение выполняет условие И подтверждено документом;
- "partial" — выполнена часть условия (2 из 3 сертификатов) или документ с истёкшим сроком на дату подачи;
- "unconfirmed" — заявлено (например, в техпредложении), но нет подтверждающего документа;
- "fail" — значение нарушает условие или пункт отсутствует в заявке;
- "review" — требуется экспертное суждение (например, «или эквивалент» при неполных данных) или твоя уверенность ниже ${threshold}%.

Правила:
1. Приоритет источников: официальный документ производителя / сертификат > техпредложение участника > маркетинговые материалы. sourceKind: official|certificate|proposal|marketing|other.
2. claimedValue — ТОЛЬКО число (без единиц), claimedUnit — единица. Для числовых требований обязательно заполни, числа сверит код.
3. Сроки действия документов проверяй на дату окончания приёма заявок: ${deadline || 'не указана'}. validUntil — дата окончания действия документа в формате YYYY-MM-DD, если есть.
4. quote — ДОСЛОВНАЯ цитата из заявки на языке оригинала (до 300 символов); fileName и page — точно из маркеров «--- [имя файла, стр. N] ---». Если в заявке нет данных — found=false, quote пусто.
5. Если исходник на другом языке — дай перевод в translation (на ${LANG_NAME[lang]}).
6. rationale — краткое обоснование на ${LANG_NAME[lang]} языке (что требуется, что найдено, почему такой статус).
7. Для статусов кроме "ok" дай recommendation: problem (что не так), action (конкретное действие, а не общий совет), actionType: add_doc|fix_data|replace_product|ask_customer|unfixable, criticality: high (ведёт к отклонению)|medium|low. НИКОГДА не предлагай исказить факты: если товар не соответствует — «заменить модель» или «запросить разъяснение», а не «исправить цифру».
8. Предложение сверх требования не является несоответствием — отметь exceeds=true (сильная сторона).
9. Многопозиционные лоты — сопоставляй позицию заявки с позицией лота по наименованию и номеру.
Верни JSON: {"results":[{"id":"T-001","found":true,"claimed":"что заявлено (кратко)","claimedValue":"","claimedUnit":"","confirmedByDoc":true,"sourceKind":"official","validUntil":"","fileName":"","page":1,"quote":"","translation":"","status":"ok","rationale":"","confidence":90,"exceeds":false,"recommendation":null}]}`

interface RawMatch {
  id?: string; found?: boolean; claimed?: string; claimedValue?: unknown; claimedUnit?: string; confirmedByDoc?: boolean; sourceKind?: string
  validUntil?: string; fileName?: string; page?: unknown; quote?: string; translation?: string; status?: string; rationale?: string
  confidence?: unknown; exceeds?: boolean; recommendation?: { problem?: string; action?: string; actionType?: string; criticality?: string } | null
}

/**
 * Достаточен ли источник для подтверждения (ТЗ 5): официальный документ / сертификат > техпредложение > маркетинг.
 * Техпредложение подтверждает только то, что им и требуется подтверждать (количество, срок поставки,
 * срок действия предложения); если способ подтверждения — паспорт, сертификат, лицензия, письмо, справка,
 * одного техпредложения мало.
 */
const OFFICIAL_PROOF = /паспорт|datasheet|сертификат|certificate|sertifikat|лиценз|license|licence|litsenziya|письм|letter|справк|ma'lumotnoma|деклараци|declaration|свидетельств|guvohnoma|отчётност|отчетност|financial|договор|contract|shartnoma|акт|гаранти[ия] банк|банковск/i
const PROPOSAL_PROOF = /предложени|proposal|offer|taklif/i

function sourceConfirms(req: Requirement, kind: NonNullable<Match['sourceKind']>, llmConfirmed: boolean): boolean {
  if (!llmConfirmed || kind === 'marketing') return false
  if (kind !== 'proposal') return true
  const proof = req.proof ?? ''
  return !proof || PROPOSAL_PROOF.test(proof) || !OFFICIAL_PROOF.test(proof)
}

function postProcess(req: Requirement, m: RawMatch, files: DocFile[], s: Settings, deadline: string, truncated = false): Match {
  const found = m.found !== false && !!str(m.quote || m.claimed)
  let source: SourceRef | undefined
  let verified = false
  if (found && str(m.quote)) {
    source = { fileName: str(m.fileName), page: num(m.page, 1), quote: str(m.quote), translation: str(m.translation) || undefined }
    const loc = locateQuote(files, source)
    if (loc) {
      Object.assign(source, { fileId: loc.fileId, fileName: loc.fileName, page: loc.page })
      verified = true
    }
  }
  let confidence = Math.max(0, Math.min(100, num(m.confidence, 70)))
  let status: Status = pick(m.status, STATUSES, 'review')
  const sourceKind = pick(m.sourceKind, ['official', 'certificate', 'proposal', 'marketing', 'other'], 'other')
  // ТЗ 5: приоритет источников — маркетинг и (для «паспорт/сертификат») техпредложение не подтверждают требование
  const confirmed = sourceConfirms(req, sourceKind, !!m.confirmedByDoc)
  let method: Match['method'] = 'llm'
  let ruleNote: string | undefined
  let exceeds = !!m.exceeds
  const notes: string[] = []

  if (!found && truncated) {
    // пакет не поместился в лимит — «нет в заявке» утверждать нельзя
    status = 'review'
    notes.push('пакет заявки усечён по объёму — пункт мог оказаться в непроверенной части')
  } else if (!found) {
    status = 'fail'
  } else {
    if (!verified) {
      confidence = Math.min(confidence, 50)
      notes.push('цитата из заявки не найдена в тексте документов')
    } else if (source && lowOcr(files, source.fileId, source.page)) {
      confidence = Math.min(confidence, s.reviewThreshold - 1)
      notes.push('источник распознан OCR с низкой уверенностью — сверьте с оригиналом')
    }
    const rr = applyRule(req, status, confirmed, str(m.claimedValue), str(m.claimedUnit))
    if (rr.rule) {
      status = rr.status
      method = 'rule'
      ruleNote = rr.rule.note
      exceeds = !!rr.rule.exceeds
      // числа сверены кодом по подтверждённой цитате — уверенность высокая (но не при плохом OCR)
      if (verified && !lowOcr(files, source?.fileId, source?.page ?? 0)) confidence = Math.max(confidence, 95)
    } else if (status === 'ok' && !confirmed) {
      // «Заявлено, не подтверждено» (ТЗ 5, 6): без подтверждающего документа зелёный статус не ставится
      status = 'unconfirmed'
    }
    // Срок действия на дату подачи — проверка кодом
    const vu = isoDate(str(m.validUntil))
    const dl = isoDate(deadline)
    if (vu && dl && vu < dl && (status === 'ok' || status === 'unconfirmed')) {
      status = 'partial'
      notes.push(`документ действует до ${vu}, а подача до ${dl}`)
    }
    // ниже порога уверенности (в т.ч. неподтверждённая цитата) — на ручную проверку (ТЗ 6, 10)
    if (confidence < s.reviewThreshold) status = 'review'
  }

  const rec = m.recommendation
  let recommendation: Match['recommendation']
  if (status !== 'ok') {
    recommendation = {
      problem: str(rec?.problem) || (found || truncated ? str(m.rationale) || notes.join('. ') : 'Пункт отсутствует в заявке'),
      action: str(rec?.action) || (found ? 'Проверить пункт вручную' : `Добавить в заявку: ${req.parameter}${req.proof ? ` (${req.proof})` : ''}`),
      actionType: pick(rec?.actionType, ACTIONS, found ? 'fix_data' : 'add_doc'),
      criticality: pick(rec?.criticality, ['high', 'medium', 'low'], req.type === 'mandatory' ? 'high' : 'medium'),
    }
  }
  return {
    reqId: req.id,
    status,
    aiStatus: status,
    claimed: str(m.claimed) || (found ? '' : '—'),
    claimedValue: str(m.claimedValue) || undefined,
    claimedUnit: str(m.claimedUnit) || undefined,
    confirmedByDoc: confirmed,
    sourceKind,
    validUntil: isoDate(str(m.validUntil)) || str(m.validUntil) || undefined,
    source,
    rationale: [str(m.rationale), ...notes].filter(Boolean).join('. '),
    confidence,
    method,
    ruleNote,
    recommendation,
    exceeds: exceeds && (status === 'ok' || status === 'unconfirmed'),
  }
}

/** Приводит дату к YYYY-MM-DD (понимает YYYY-MM-DD и DD.MM.YYYY / DD/MM/YYYY). */
function isoDate(d: string): string {
  let m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = d.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

export async function analyzeParticipant(p: Project, part: Participant, s: Settings, progress: Progress, onlyIds?: string[]): Promise<Participant> {
  const files = part.files
  const { text, truncated } = packText(files)
  if (!text.trim()) throw new Error('Пакет заявки не содержит распознанного текста')
  const reqs = p.requirements.filter((r) => !r.excluded && (!onlyIds || onlyIds.includes(r.id)))

  progress('stage_facts')
  let facts: Fact[] = part.facts
  let contradictions: Contradiction[] = part.contradictions
  let name = part.name
  let inn = part.inn
  try {
    const f = await callJSON<{ participantName?: string; inn?: string; facts?: (RawReq & { value?: string })[]; contradictions?: RawQ[] }>(s, {
      system: FACTS_SYSTEM(s.reportLang),
      user: (truncated ? '(Пакет усечён до лимита.)\n' : '') + text,
      maxTokens: 16000,
    })
    facts = (f.facts ?? []).map((x) => {
      const src: SourceRef = { fileName: str(x.fileName), page: num(x.page, 1), quote: str(x.quote) }
      const loc = locateQuote(files, src)
      if (loc) Object.assign(src, { fileId: loc.fileId, fileName: loc.fileName, page: loc.page })
      return { scope: pick<Scope>(x.scope, ['product', 'participant'], 'product'), category: str(x.category), parameter: str(x.parameter), value: str(x.value), source: src }
    })
    contradictions = (f.contradictions ?? []).map((q) => {
      const qq = toQuestion(q, files)
      return { text: qq.text, sources: qq.sources }
    })
    if (str(f.participantName) && /^Участник \d+$|^Bidder|^Ishtirokchi/.test(name)) name = str(f.participantName)
    if (str(f.inn)) inn = str(f.inn)
  } catch (e) {
    console.warn('facts', e)
  }

  if (truncated) progress('stage_match', 'пакет заявки превышает лимит — часть страниц не передана в AI, ненайденные пункты помечены «Требует проверки»')
  const batches: Requirement[][] = []
  for (let i = 0; i < reqs.length; i += 15) batches.push(reqs.slice(i, i + 15))
  let done = 0
  progress('stage_match', `0/${reqs.length}`)
  const batchErrors = new Map<string, string>()
  const results = await pool(batches, 3, async (batch) => {
    const compact = batch.map((r) => ({
      id: r.id, scope: r.scope, category: r.category, lotItem: r.lotItem, parameter: r.parameter,
      condition: reqCondition(r) || r.value || '', operator: r.operator, value: r.value, valueMax: r.valueMax, unit: r.unit,
      type: r.type, proof: r.proof, quote: r.source.quote.slice(0, 300),
    }))
    try {
      const out = await callJSON<{ results?: RawMatch[] }>(s, {
        system: MATCH_SYSTEM(s.reportLang, p.deadline, s.reviewThreshold),
        user: `ТРЕБОВАНИЯ ЗАКАЗЧИКА (${batch.length}):\n${JSON.stringify(compact)}\n\n${truncated ? 'ВНИМАНИЕ: пакет заявки усечён по объёму — если данных нет в переданном тексте, ставь found=false и status "review".\n' : ''}ПАКЕТ ЗАЯВКИ УЧАСТНИКА:\n${text}`,
        maxTokens: 16000,
      })
      return out.results ?? []
    } catch (e) {
      // ошибка одного батча не роняет всю проверку: его пункты уходят на ручную проверку
      for (const r of batch) batchErrors.set(r.id, e instanceof Error ? e.message : String(e))
      return []
    } finally {
      done += batch.length
      progress('stage_match', `${done}/${reqs.length}`)
    }
  })
  if (reqs.length && batchErrors.size === reqs.length) throw new Error(`AI не ответил ни по одному пункту: ${[...batchErrors.values()][0]}`)
  const byId = new Map<string, RawMatch>()
  for (const r of results.flat()) if (r?.id) byId.set(str(r.id), r)

  progress('stage_score')
  const matches: Record<string, Match> = onlyIds ? { ...part.matches } : {}
  for (const r of reqs) {
    const err = batchErrors.get(r.id)
    const why = err ? `Ошибка AI при проверке пункта: ${err}` : 'Модель не вернула результат по пункту'
    const raw = byId.get(r.id) ?? { id: r.id, found: false, rationale: why, confidence: 0 }
    const m = postProcess(r, raw, files, s, p.deadline, truncated)
    if (!byId.has(r.id)) {
      m.status = 'review'
      m.aiStatus = 'review'
      m.rationale = why
      m.recommendation = {
        problem: why,
        action: 'Повторить проверку пункта или проверить его вручную',
        actionType: 'fix_data',
        criticality: r.type === 'mandatory' ? 'high' : 'medium',
      }
    }
    matches[r.id] = m
  }
  const next: Participant = { ...part, name, inn, facts, contradictions, matches }
  next.versions = [...part.versions, makeVersion(p, part, next, s, onlyIds ? 'Повторная проверка' : 'Первичная проверка')]
  return next
}

export function makeVersion(p: Project, prev: Participant, next: Participant, s: Settings, label: string): Version {
  const sc = computeScore(p, next, s)
  const changes: string[] = []
  for (const [id, m] of Object.entries(next.matches)) {
    const old = prev.matches[id]
    if (old && old.status !== m.status) changes.push(`${id}: ${old.status} → ${m.status}`)
  }
  return {
    at: new Date().toISOString(),
    label,
    score: sc.score,
    scoreMin: sc.scoreMin,
    scoreMax: sc.scoreMax,
    product: sc.product,
    participant: sc.participant,
    verdict: sc.verdict,
    changes,
  }
}

// ------------------------------------------------------------------
// 3. Аналитический вывод, запрос разъяснений, чат
// ------------------------------------------------------------------

export async function makeAnalysis(p: Project, part: Participant, s: Settings): Promise<Analysis> {
  const sc = computeScore(p, part, s)
  const items = p.requirements.filter((r) => !r.excluded).map((r) => {
    const m = part.matches[r.id]
    return { id: r.id, req: `${r.parameter} ${reqCondition(r)}`.trim(), type: r.type, status: m?.status, claimed: m?.claimed, exceeds: m?.exceeds, problem: m?.recommendation?.problem, action: m?.recommendation?.action, impact: m && m.status !== 'ok' ? impactOf(p, part, r.id, s) : 0 }
  })
  const r = await callJSON<{ summary?: string; strengths?: string[]; risks?: string[] }>(s, {
    system: `Ты — тендерный аналитик. Пиши на ${LANG_NAME[s.reportLang]} языке, деловым стилем, без воды. Опирайся только на переданные данные.`,
    user: `Сформируй аналитический вывод по заявке участника «${part.name}» на лот «${p.name}».
Итог: ${sc.score.toFixed(1)}% (товар ${sc.product.toFixed(1)}%, участник ${sc.participant.toFixed(1)}%), обязательных выполнено ${sc.mandatoryOk} из ${sc.mandatoryTotal}, вердикт: ${sc.verdict}, прогноз после устранения: ${sc.forecast.toFixed(1)}%.
Противоречия внутри заявки: ${JSON.stringify(part.contradictions.map((c) => c.text))}
Вопросы к заказчику: ${JSON.stringify(p.questions.map((q) => q.text))}
Пункты: ${JSON.stringify(items)}
Верни JSON {"summary":"связный текст ~1 страница: 1) итог одним предложением (вердикт + % + число критичных проблем); 2) критичные несоответствия, ведущие к отклонению; 3) несоответствия, снижающие баллы; 4) план действий по влиянию на итог","strengths":["сильные стороны заявки"],"risks":["риски: истекающие документы, противоречия, неоднозначности документации"]}`,
    maxTokens: 6000,
  })
  return { summary: str(r.summary), strengths: (r.strengths ?? []).map(str).filter(Boolean), risks: (r.risks ?? []).map(str).filter(Boolean), generatedAt: new Date().toISOString() }
}

export async function makeClarification(p: Project, s: Settings): Promise<string> {
  const qs = p.questions.map((q) => ({ kind: q.kind, text: q.text, src: q.sources.map((x) => `${x.fileName}, стр. ${x.page}: «${x.quote}»`) }))
  const asks = p.participants.flatMap((pt) => Object.values(pt.matches).filter((m) => m.recommendation?.actionType === 'ask_customer').map((m) => `${m.reqId}: ${m.recommendation?.problem}`))
  return callLLM(s, {
    system: `Ты — тендерный юрист. Пишешь официальный запрос на разъяснение положений закупочной документации (Республика Узбекистан). Язык: ${LANG_NAME[s.reportLang]}. Без markdown-разметки, обычный текст с нумерацией.`,
    user: `Закупка: «${p.name}», лот ${p.lotNumber || '—'}, заказчик: ${p.customer || '—'}. Срок подачи: ${p.deadline || '—'}.
Составь черновик запроса на разъяснение: шапка (Кому/От кого — плейсхолдеры), вступление, нумерованные вопросы со ссылкой на пункт/страницу документации и цитатой, просьба о разъяснении в установленный срок, подпись-плейсхолдер.
Противоречия и неоднозначности: ${JSON.stringify(qs)}
Дополнительные вопросы из сверки заявок: ${JSON.stringify(asks)}`,
    maxTokens: 6000,
  })
}

export async function askChat(p: Project, part: Participant | undefined, question: string, history: { role: string; text: string }[], s: Settings): Promise<string> {
  const reqs = p.requirements.filter((r) => !r.excluded).map((r) => {
    const m = part?.matches[r.id]
    return `${r.id} [${r.type}] ${r.parameter} ${reqCondition(r)} | источник: ${r.source.fileName} стр.${r.source.page} «${r.source.quote.slice(0, 200)}»${m ? ` | статус: ${m.status}; заявлено: ${m.claimed}; ${m.source ? `${m.source.fileName} стр.${m.source.page} «${m.source.quote.slice(0, 200)}»` : ''}; обоснование: ${m.rationale}` : ''}`
  })
  const docs = packText([...p.customerFiles, ...(part?.files ?? [])], 250_000).text
  return callLLM(s, {
    system: `Ты — ассистент по проекту тендерной проверки. Отвечай ТОЛЬКО на основе загруженных документов и результатов сверки ниже. Всегда указывай источник (файл, страница, цитата). Если ответа в документах нет — так и скажи. Язык ответа: ${LANG_NAME[s.reportLang]}. Кратко, по делу, без markdown-таблиц.`,
    user: `ЧЕК-ЛИСТ И РЕЗУЛЬТАТЫ (${part ? 'участник: ' + part.name : 'заявка не загружена'}):\n${reqs.join('\n')}\n\nДОКУМЕНТЫ:\n${docs}\n\nИСТОРИЯ ДИАЛОГА:\n${history.slice(-6).map((h) => `${h.role}: ${h.text}`).join('\n')}\n\nВОПРОС: ${question}`,
    maxTokens: 3000,
  })
}

export async function testConnection(s: Settings): Promise<string> {
  const r = await callJSON<{ ok?: boolean; model?: string }>(s, { system: 'Ответь JSON.', user: 'Верни {"ok": true}', maxTokens: 2000 })
  if (!r.ok) throw new Error('Неожиданный ответ')
  return 'ok'
}
