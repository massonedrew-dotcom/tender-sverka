// Экспорт: XLSX (чек-листы и сравнение), DOCX (запрос на разъяснение), JSON
import * as XLSX from 'xlsx'
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import type { Participant, Project, Settings } from '../types'
import type { T } from '../i18n'
import { atLabel, critLabel, scopeLabel, stLabel, typeLabel } from '../i18n'
import { computeScore, impactOf } from './scoring'
import { reqCondition } from './units'

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)

/** Имя листа Excel: без []:*?/\, не длиннее 31 символа, уникальное в книге (два участника с одинаковым началом имени). */
function sheetName(wb: XLSX.WorkBook, name: string, fallback: string): string {
  const base = (name.replace(/[[\]:*?/\\]+/g, '_').replace(/^'+|'+$/g, '').trim() || fallback).slice(0, 31)
  let n = base
  for (let i = 2; wb.SheetNames.some((x) => x.toLowerCase() === n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)}~${i}`
  return n
}

export function exportXlsx(p: Project, t: T, s: Settings) {
  const wb = XLSX.utils.book_new()
  const reqRows = p.requirements.map((r) => ({
    [t('id')]: r.id,
    [t('scope_product') + '/' + t('scope_participant')]: scopeLabel(t, r.scope),
    [t('category')]: r.category,
    [t('lotItem')]: r.lotItem ?? '',
    [t('parameter')]: r.parameter,
    [t('condition')]: reqCondition(r) || r.value || '',
    [t('type')]: typeLabel(t, r.type),
    [t('proof')]: r.proof ?? '',
    [t('consequence')]: r.consequence ?? '',
    [t('source')]: `${r.source.fileName}, ${t('pages')} ${r.source.page}${r.source.clause ? ', ' + r.source.clause : ''}`,
    Цитата: r.source.quote,
    [t('confidence')]: r.confidence,
    [t('excluded')]: r.excluded ? '✓' : '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reqRows), 'Требования')

  for (const part of p.participants) {
    const sc = computeScore(p, part, s)
    const rows = p.requirements.filter((r) => !r.excluded).map((r) => {
      const m = part.matches[r.id]
      return {
        [t('id')]: r.id,
        [t('requirement')]: `${r.parameter} ${reqCondition(r)}`.trim(),
        [t('type')]: typeLabel(t, r.type),
        [t('application')]: m?.claimed ?? '',
        [t('status')]: m ? stLabel(t, m.status) : '',
        [t('rationale')]: m?.rationale ?? '',
        'Источник (заявка)': m?.source ? `${m.source.fileName}, ${t('pages')} ${m.source.page}: «${m.source.quote}»` : '',
        [t('whatsWrong')]: m?.recommendation?.problem ?? '',
        [t('action')]: m?.recommendation?.action ?? '',
        [t('actionType')]: m?.recommendation ? atLabel(t, m.recommendation.actionType) : '',
        [t('criticality')]: m?.recommendation ? critLabel(t, m.recommendation.criticality) : '',
        [t('impact')]: m && m.status !== 'ok' ? `+${impactOf(p, part, r.id, s)}%` : '',
      }
    })
    rows.push({} as never)
    rows.push({ [t('id')]: t('compliance'), [t('requirement')]: `${sc.score.toFixed(1)}%` } as never)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName(wb, part.name, 'Заявка'))
  }
  if (p.questions.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(p.questions.map((q) => ({ Вид: q.kind, Вопрос: q.text, Источники: q.sources.map((x) => `${x.fileName} стр.${x.page}: «${x.quote}»`).join('\n') }))),
      'Вопросы к заказчику',
    )
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Сверка_${safe(p.lotNumber || p.name)}.xlsx`)
}

export async function exportDocx(p: Project, text: string) {
  const paras = text.split(/\n/).map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line, font: 'Times New Roman', size: 24 })],
        spacing: { after: 120 },
        alignment: AlignmentType.JUSTIFIED,
      }),
  )
  const doc = new Document({ sections: [{ children: paras }] })
  const blob = await Packer.toBlob(doc)
  download(blob, `Запрос_разъяснений_${safe(p.lotNumber || p.name)}.docx`)
}

export function exportJson(p: Project, part?: Participant) {
  const data = part ? { ...p, participants: [part] } : p
  // текст страниц не включаем, чтобы файл был компактным
  const slim = JSON.parse(JSON.stringify(data), (k, v) => (k === 'pages' ? undefined : v))
  download(new Blob([JSON.stringify(slim, null, 2)], { type: 'application/json' }), `Сверка_${safe(p.lotNumber || p.name)}.json`)
}

export function downloadText(name: string, text: string) {
  download(new Blob([text], { type: 'text/plain;charset=utf-8' }), name)
}

export { download }
