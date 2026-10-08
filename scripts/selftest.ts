// Самотесты чистой логики (units, scoring, text, demo). Запуск: npm run test
import type { DocFile, Operator, Requirement, SourceRef, Status } from '../src/types.ts'
import { applyRule, compareNumeric, parseNumber, unitDef } from '../src/lib/units.ts'
import { computeScore, DEFAULT_K, DEFAULT_WEIGHTS } from '../src/lib/scoring.ts'
import { chunkFiles, fuzzyScore, locateQuote } from '../src/lib/text.ts'
import { buildDemoProject } from '../src/demo/demoProject.ts'

let passed = 0
const failures: string[] = []
function check(name: string, cond: boolean, info = '') {
  if (cond) passed++
  else failures.push(`${name}${info ? ` — ${info}` : ''}`)
}
const section = (t: string) => console.log(`\n=== ${t} ===`)

// ---------------------------------------------------------------- (а) units
section('Единицы и числовые правила')

function req(operator: Operator, value: string, unit?: string, valueMax?: string): Requirement {
  return {
    id: 'X-001', scope: 'product', category: '', parameter: 'p', operator, value, valueMax, unit, type: 'mandatory',
    source: { fileName: '', page: 1, quote: '' }, confidence: 100, quoteVerified: true,
  }
}

const numCases: [string, Requirement, string, string | undefined, Status, boolean?][] = [
  ['16 ГБ ≥ 16 ГБ', req('>=', '16', 'ГБ'), '16', 'GB', 'ok'],
  ['24 мес < 36 мес', req('>=', '36', 'мес'), '24', 'months', 'fail'],
  ['3 года = 36 мес', req('>=', '36', 'мес'), '3', 'года', 'ok'],
  ['3 г. = 36 мес («г.» — год, не грамм)', req('>=', '36', 'мес'), '3', 'г.', 'ok'],
  ['250 nits < 300 кд/м²', req('>=', '300', 'кд/м²'), '250', 'nits', 'fail'],
  ['7 200 000 тыс. сум ≥ 5 000 000 000 сум', req('>=', '5 000 000 000', 'сум'), '7 200 000', 'тыс. сум', 'ok'],
  ['2 договора из 3 → partial', req('>=', '3', 'договоров'), '2', 'договора', 'partial'],
  ['0 договоров из 3 → fail', req('>=', '3', 'договоров'), '0', 'договоров', 'fail'],
  ['1,79 кг ≤ 1,8 кг', req('<=', '1,8', 'кг'), '1,79', 'кг', 'ok'],
  ['1,81 кг > 1,8 кг', req('<=', '1,8', 'кг'), '1,81', 'кг', 'fail'],
  ['1800 г ≤ 1,8 кг', req('<=', '1.8', 'кг'), '1800', 'г', 'ok'],
  ['15,6″ ∈ [14; 15,6]', req('range', '14', 'дюйм', '15,6'), '15,6', '"', 'ok'],
  ['16″ ∉ [14; 15,6]', req('range', '14', 'дюйм', '15.6'), '16', 'inch', 'fail'],
  ['381 мм ∈ [14; 15,6] дюйма', req('range', '14', 'дюйма', '15.6'), '381', 'мм', 'ok'],
  ['228 В ∈ 220 ± 10 В', req('tolerance', '220', 'В', '10'), '228', 'V', 'ok'],
  ['235 В ∉ 220 ± 10 В', req('tolerance', '220', 'В', '10'), '235', 'В', 'fail'],
  ['122 °F = 50 °C', req('>=', '50', '°C'), '122', '°F', 'ok'],
  ['30 дней ≤ 45 календарных дней', req('<=', '45', 'календарных дней'), '30', 'дней', 'ok'],
  ['4,8 ГГц ≥ 4,4 ГГц', req('>=', '4,4', 'ГГц'), '4.8', 'GHz', 'ok'],
  ['16 ГБ без документа → unconfirmed', req('>=', '16', 'ГБ'), '16', 'ГБ', 'unconfirmed', false],
]
for (const [name, r, cv, cu, expected, confirmed = true] of numCases) {
  const res = applyRule(r, 'ok', confirmed, cv, cu)
  check(`units: ${name}`, res.status === expected, `ожидалось ${expected}, получено ${res.status} (${res.rule?.note ?? 'правило не применено'})`)
}
// несопоставимые / неизвестные единицы — код не решает, остаётся статус LLM
check('units: ГБ vs кг → не сравнивается', compareNumeric(req('>=', '16', 'ГБ'), '16', 'кг').pass === null)
check('units: неизвестные разные единицы → не сравнивается', compareNumeric(req('>=', '5', 'попугаев'), '7', 'удавов').pass === null)
check('units: превышение помечается exceeds', compareNumeric(req('>=', '8', 'ядер'), '16', 'cores').exceeds === true)
check('units: unitDef(«г.») — время', unitDef('г.')?.dim === 'time')
check('units: unitDef(«г») — масса', unitDef('г')?.dim === 'mass')
// «0 ложных ok»: число проходит, но AI счёл пункт невыполненным/спорным → только «review»
check('rule: число проходит, AI = fail → review', applyRule(req('>=', '16', 'ГБ'), 'fail', true, '16', 'ГБ').status === 'review')
check('rule: число проходит, AI = review → review', applyRule(req('>=', '16', 'ГБ'), 'review', true, '32', 'ГБ').status === 'review')
check('rule: число проходит, AI = unconfirmed → unconfirmed', applyRule(req('>=', '16', 'ГБ'), 'unconfirmed', true, '32', 'ГБ').status === 'unconfirmed')
check('units: единица только у заявки (МБ) → не сравнивается', compareNumeric(req('>=', '16'), '16', 'МБ').pass === null)
check('units: безразмерное количество 120 = 120 шт', compareNumeric(req('=', '120'), '120', 'шт').pass === true)
check('quote: пунктуация не мешает', fuzzyScore('Memory: 16 GB, DDR5-5600', 'Memory 16 GB DDR5 5600') === 1)
check('quote: короткая цитата — только точное вхождение', fuzzyScore('Масса: 1,79 кг. Цвет серый', '1,8 кг') === 0)
check('quote: короткая цитата найдена точно', fuzzyScore('Масса: 1,79 кг. Цвет серый', '1,79 кг') === 1)

const numParse: [string, number | null][] = [
  ['7 200 000', 7200000], ['1,79', 1.79], ['4.75 GHz', 4.75], ['до 4,8 ГГц', 4.8], ['5,000,000', 5000000],
  ['1.234,56', 1234.56], ['12 400 000 000 сум', 12400000000], ['120 2026', 120], ['-40', -40], ['нет', null],
  ['7 200 000', 7200000],
]
for (const [s, v] of numParse) check(`parseNumber(${JSON.stringify(s)})`, parseNumber(s) === v, `получено ${parseNumber(s)}`)
console.log(`  кейсов: ${numCases.length + 13 + numParse.length}`)

// ---------------------------------------------------------------- text
section('Текст и цитаты')
{
  const big: DocFile = {
    id: 'f-big', name: 'big.xlsx', size: 0, docType: 'Спецификация', warnings: [], addedAt: '',
    pages: [{ n: 1, text: 'строка таблицы | значение\n'.repeat(12_000) }],
  }
  const chunks = chunkFiles([big], 90_000)
  const total = chunks.join('').split('строка таблицы').length - 1
  check('chunkFiles: длинная страница делится без потери текста', chunks.length > 1 && total === 12_000, `чанков ${chunks.length}, строк ${total}`)
  check('chunkFiles: каждый чанк ≤ лимита', chunks.every((c) => c.length <= 90_000))
}

// ---------------------------------------------------------------- (б) scoring демо
section('Скоринг демо-проекта')
const settings = { weights: { ...DEFAULT_WEIGHTS }, k: { ...DEFAULT_K } }
const demo = buildDemoProject(settings)
const expectedVerdict: Record<string, string> = { 'p-a': 'risk', 'p-b': 'needs_work' }
for (const part of demo.participants) {
  const sc = computeScore(demo, part, settings)
  const f = (n: number) => n.toFixed(1) + '%'
  console.log(
    `  ${part.name}: ${f(sc.score)} (диапазон ${f(sc.scoreMin)}–${f(sc.scoreMax)}; товар ${f(sc.product)}, участник ${f(sc.participant)}), ` +
      `обязательных ${sc.mandatoryOk}/${sc.mandatoryTotal}, вердикт: ${sc.verdict}, прогноз: ${f(sc.forecast)}, ` +
      `статусы: ${Object.entries(sc.counts).map(([k, v]) => `${k}=${v}`).join(' ')}`,
  )
  check(`scoring: вердикт ${part.name}`, sc.verdict === expectedVerdict[part.id], `ожидалось ${expectedVerdict[part.id]}, получено ${sc.verdict}`)
  check(`scoring: диапазон от–до ${part.name}`, sc.scoreMin <= sc.score + 1e-9 && sc.score <= sc.scoreMax + 1e-9)
  check(`scoring: прогноз ≥ текущего ${part.name}`, sc.forecast >= sc.score - 1e-9)
  check(`scoring: у каждого требования есть результат ${part.name}`, demo.requirements.every((r) => !!part.matches[r.id]))
  // числа демо согласованы с правилами кода
  for (const r of demo.requirements) {
    const m = part.matches[r.id]
    if (!m?.claimedValue) continue
    const rr = applyRule(r, m.status, m.confirmedByDoc, m.claimedValue, m.claimedUnit)
    check(`demo: статус ${part.name} ${r.id} согласован с правилом`, !!rr.rule && rr.status === m.status, `в демо ${m.status}, по правилу ${rr.status} (${rr.rule?.note ?? 'правило не применилось'})`)
  }
  // срок действия документов на дату подачи
  for (const m of Object.values(part.matches)) {
    if (m.validUntil && m.validUntil < demo.deadline) check(`demo: ${part.name} ${m.reqId} — истёкший документ не может быть «ok»`, m.status !== 'ok', m.validUntil)
  }
}

// ---------------------------------------------------------------- (в) цитаты демо
section('Цитаты демо-проекта')
let quoteCount = 0
function checkQuote(where: string, files: DocFile[], ref: SourceRef) {
  quoteCount++
  const loc = locateQuote(files, ref)
  const ok = !!loc && loc.fileName === ref.fileName && loc.page === ref.page && (!ref.fileId || loc.fileId === ref.fileId) && loc.score === 1
  check(`quote: ${where}`, ok, loc ? `найдено: ${loc.fileName} стр. ${loc.page}, score ${loc.score.toFixed(2)}; ожидалось ${ref.fileName} стр. ${ref.page}` : `не найдено «${ref.quote}» (${ref.fileName}, стр. ${ref.page})`)
}
for (const r of demo.requirements) checkQuote(`требование ${r.id}`, demo.customerFiles, r.source)
for (const q of demo.questions) q.sources.forEach((s, i) => checkQuote(`вопрос ${q.id}#${i + 1}`, demo.customerFiles, s))
for (const part of demo.participants) {
  for (const m of Object.values(part.matches)) if (m.source) checkQuote(`${part.name} ${m.reqId}`, part.files, m.source)
  part.facts.forEach((f) => checkQuote(`${part.name} факт «${f.parameter}»`, part.files, f.source))
  part.contradictions.forEach((c, i) => c.sources.forEach((s, j) => checkQuote(`${part.name} противоречие ${i + 1}#${j + 1}`, part.files, s)))
}
console.log(`  проверено цитат: ${quoteCount}`)

// ---------------------------------------------------------------- итог
console.log(`\nПройдено: ${passed}, ошибок: ${failures.length}`)
if (failures.length) {
  for (const f of failures) console.log('  ✗ ' + f)
  process.exitCode = 1
}
