// Приём файлов и приведение к единому текстовому представлению (ТЗ, раздел 3)
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import type { DocFile, DocPage, Settings } from '../types'
import { callJSON, pool } from './llm'
import { uid } from './text'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

// CMaps (CJK и нестандартные кодировки) и стандартные шрифты не входят в бандл — берём с CDN той же версии
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/`

export type Progress = (msg: string) => void

const PAGE_CHARS = 3500

function splitPages(text: string): DocPage[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  if (clean.includes('\f')) return clean.split('\f').map((t, i) => ({ n: i + 1, text: t.trim() }))
  const pages: DocPage[] = []
  const paras = clean.split(/\n/)
  let cur = ''
  for (const p of paras) {
    if (cur.length + p.length > PAGE_CHARS && cur) {
      pages.push({ n: pages.length + 1, text: cur.trim() })
      cur = ''
    }
    cur += p + '\n'
  }
  if (cur.trim()) pages.push({ n: pages.length + 1, text: cur.trim() })
  return pages
}

const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase()

// ---------- OCR через мультимодальную LLM ----------

async function ocrImage(s: Settings | null, dataUrl: string, hint: string): Promise<{ text: string; confidence: number }> {
  if (!s || (!s.apiKey && !s.baseUrl)) throw new Error('no-ai')
  const r = await callJSON<{ text: string; confidence: number; rotated?: boolean }>(s, {
    system:
      'Ты — система OCR для тендерных документов (узбекский латиница/кириллица, русский, английский, китайский и др.). Распознай ВЕСЬ текст изображения дословно, на языке оригинала, сохраняя порядок. Таблицы выводи строками с разделителем " | ". Если есть печать, подпись, QR-код или штрихкод — добавь в конце строки вида [ПЕЧАТЬ], [ПОДПИСЬ], [QR-КОД], [ШТРИХКОД]. Для чертежей распознай штамп (основную надпись), размеры, примечания и технические требования. Не придумывай текст, нечитаемое помечай [неразборчиво].',
    user: `Файл: ${hint}. Верни JSON: {"text": "распознанный текст", "confidence": число 0-100 — твоя оценка качества распознавания}`,
    images: [dataUrl],
    maxTokens: 8000,
  })
  const conf = Number(r.confidence)
  return { text: String(r.text ?? ''), confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : 70 }
}

async function imageToDataUrl(blob: Blob, maxSide = 2000): Promise<string> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

// ---------- PDF ----------

async function readPdf(buf: ArrayBuffer, name: string, s: Settings | null, progress: Progress): Promise<{ pages: DocPage[]; warnings: string[] }> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    cMapUrl: `${PDFJS_CDN}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_CDN}standard_fonts/`,
  })
  try {
    return await readPdfDoc(await task.promise, name, s, progress)
  } finally {
    void task.destroy() // pdf.js v6: освобождение документа — через loadingTask
  }
}

async function readPdfDoc(doc: pdfjs.PDFDocumentProxy, name: string, s: Settings | null, progress: Progress): Promise<{ pages: DocPage[]; warnings: string[] }> {
  const pages: DocPage[] = []
  const warnings: string[] = []
  const scanned: number[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    let text = ''
    let lastY: number | null = null
    for (const it of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = it.transform?.[5]
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) text += '\n'
      else if (text && !text.endsWith(' ') && !text.endsWith('\n')) text += ' '
      text += it.str
      if (it.hasEOL) text += '\n'
      lastY = y ?? lastY
    }
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    pages.push({ n: i, text })
    if (text.replace(/\s/g, '').length < 40) scanned.push(i)
  }
  if (scanned.length) {
    const limit = s?.ocrPageLimit ?? 40
    const todo = scanned.slice(0, limit)
    if (scanned.length > limit) warnings.push(`OCR выполнен для первых ${limit} из ${scanned.length} отсканированных страниц (лимит в настройках)`)
    if (!s || (!s.apiKey && !s.baseUrl)) {
      warnings.push(`Страницы ${scanned.join(', ')} — скан без текстового слоя; для OCR нужен AI (Настройки)`)
    } else {
      let done = 0
      await pool(todo, 3, async (n) => {
        const page = await doc.getPage(n)
        const vp = page.getViewport({ scale: 2 })
        const c = document.createElement('canvas')
        c.width = vp.width
        c.height = vp.height
        // pdf.js v5+: передаётся сам canvas (canvasContext — устаревший путь)
        await page.render({ canvas: c, viewport: vp }).promise
        const url = c.toDataURL('image/jpeg', 0.85)
        c.width = c.height = 0 // освобождаем память canvas
        page.cleanup()
        try {
          const r = await ocrImage(s, url, `${name}, стр. ${n}`)
          const p = pages[n - 1]
          p.text = r.text
          p.ocr = true
          p.confidence = r.confidence
          if (r.confidence < 80) warnings.push(`Стр. ${n}: низкая уверенность распознавания (${r.confidence}%) — проверьте вручную`)
        } catch (e) {
          warnings.push(`Стр. ${n}: ошибка OCR — ${(e as Error).message}`)
        }
        progress(`OCR ${name}: ${++done}/${todo.length}`)
      })
    }
  }
  return { pages, warnings }
}

// ---------- DOCX / ODT / RTF / DOC ----------

function htmlToText(html: string): string {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const out: string[] = []
  const walk = (el: Element) => {
    for (const ch of Array.from(el.children)) {
      const tag = ch.tagName.toLowerCase()
      if (tag === 'table') {
        for (const tr of Array.from(ch.querySelectorAll('tr'))) {
          const cells = Array.from(tr.children).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim())
          out.push(cells.join(' | '))
        }
        out.push('')
      } else if (/^(p|h\d|li)$/.test(tag)) {
        const t = (ch.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) out.push(tag === 'li' ? '• ' + t : t)
      } else walk(ch)
    }
  }
  walk(dom.body)
  return out.join('\n')
}

async function readDocx(buf: ArrayBuffer): Promise<string> {
  const r = await mammoth.convertToHtml({ arrayBuffer: buf })
  return htmlToText(r.value)
}

async function readOdt(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('content.xml')?.async('string')
  if (!xml) return ''
  const dom = new DOMParser().parseFromString(xml, 'application/xml')
  const out: string[] = []
  const walk = (el: Element) => {
    for (const ch of Array.from(el.children)) {
      const ln = ch.localName
      if (ln === 'table-row') out.push(Array.from(ch.children).map((c) => (c.textContent ?? '').trim()).join(' | '))
      else if (ln === 'p' || ln === 'h') out.push((ch.textContent ?? '').trim())
      else walk(ch)
    }
  }
  walk(dom.documentElement)
  return out.filter(Boolean).join('\n')
}

function readRtf(raw: string): string {
  const dec1251 = new TextDecoder('windows-1251')
  let s = raw
  // удаляем служебные группы
  s = s.replace(/\{\\\*[^{}]*\}/g, '').replace(/\{\\(fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\s*\}/g, '')
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(n < 0 ? 65536 + Number(n) : Number(n)))
  s = s.replace(/\\'([0-9a-f]{2})/gi, (_, h) => dec1251.decode(new Uint8Array([parseInt(h, 16)])))
  s = s.replace(/\\(par|line|row)\b ?/g, '\n').replace(/\\cell\b ?/g, ' | ').replace(/\\tab\b ?/g, '\t')
  s = s.replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '')
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/** Грубое извлечение текста из старого бинарного .doc (UTF-16LE и cp1251 фрагменты). */
function readLegacyDoc(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  const u16 = new TextDecoder('utf-16le').decode(u8)
  const runs16 = u16.match(/[\p{L}\p{N}\p{P}\s№%°±≥≤]{12,}/gu) ?? []
  const cp = new TextDecoder('windows-1251').decode(u8)
  const runsCp = cp.match(/[А-Яа-яЁёA-Za-z0-9\s.,:;()«»"№%\-/]{20,}/g) ?? []
  const a = runs16.join('\n')
  const b = runsCp.join('\n')
  const cyr = (x: string) => (x.match(/[А-Яа-яЁёA-Za-z]/g) ?? []).length
  return (cyr(a) >= cyr(b) ? a : b).replace(/[ \t]{2,}/g, ' ')
}

// ---------- Таблицы ----------

function readSheet(buf: ArrayBuffer): DocPage[] {
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map((sn, i) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' })
    const text = rows.map((r) => r.map((c) => String(c ?? '').trim()).join(' | ')).join('\n')
    return { n: i + 1, text: `[Лист: ${sn}]\n${text}` }
  })
}

// ---------- Классификация файлов (ТЗ 3.1) ----------

export const DOC_TYPES = [
  'ТЗ / техническое задание',
  'Спецификация',
  'Проект договора',
  'Квалификационные требования',
  'Критерии оценки',
  'Инструкция участникам',
  'Разъяснение / изменение',
  'Техническое предложение',
  'Ценовое предложение',
  'Сертификат',
  'Лицензия',
  'Справка',
  'Доверенность',
  'Авторизационное письмо',
  'Каталог / паспорт производителя',
  'Договор / акт (опыт)',
  'Финансовая отчётность',
  'Учредительные документы',
  'Чертёж',
  'Прочее',
]

const CLASS_RULES: [RegExp, string][] = [
  [/разъяснен|изменени[ея] (в )?документац|tushuntirish|clarification|amendment|addendum/i, 'Разъяснение / изменение'],
  [/техническ[а-яё]* задани|(^|[^а-яё])тз([^а-яё]|$)|texnik topshiriq|terms of reference|technical specification|техзадани/i, 'ТЗ / техническое задание'],
  [/проект договора|договор поставки|shartnoma loyihasi|draft contract/i, 'Проект договора'],
  [/квалификац|malaka talab|qualification/i, 'Квалификационные требования'],
  [/критери[а-яё]* оценки|baholash mezon|evaluation criteria|баллы/i, 'Критерии оценки'],
  [/инструкци[а-яё]* участник|ko'rsatma|instructions to bidders/i, 'Инструкция участникам'],
  [/спецификаци|specification|spetsifikatsiya/i, 'Спецификация'],
  [/техническ[а-яё]* предложени|texnik taklif|technical proposal|technical offer/i, 'Техническое предложение'],
  [/ценов[а-яё]* предложени|narx taklif|price (proposal|offer)|коммерческ[а-яё]* предложени/i, 'Ценовое предложение'],
  [/сертификат|certificate|sertifikat|декларац[а-яё]* соответств/i, 'Сертификат'],
  [/лицензи|litsenziya|license|licence/i, 'Лицензия'],
  [/авторизац|manufacturer.?s authori[sz]ation|дилерск|mau letter|maf\b/i, 'Авторизационное письмо'],
  [/доверенност|ishonchnoma|power of attorney/i, 'Доверенность'],
  [/справк|ma'lumotnoma|certificate of|об отсутствии задолженност/i, 'Справка'],
  [/паспорт товара|datasheet|каталог|catalog|brochure|техническ[а-яё]* паспорт|specifications sheet/i, 'Каталог / паспорт производителя'],
  [/акт (выполнен|приема)|опыт|tajriba|experience|договор №|contract no/i, 'Договор / акт (опыт)'],
  [/баланс|отчет о прибыл|финансов[а-яё]* отчет|balance sheet|financial statement|moliyaviy/i, 'Финансовая отчётность'],
  [/устав|свидетельство о регистрац|guvohnoma|ustav|certificate of incorporation/i, 'Учредительные документы'],
  [/чертеж|чертёж|chizma|drawing|масштаб 1:|\.dwg/i, 'Чертёж'],
]

export function classify(name: string, text: string): string {
  // «Проект_договора.docx» → «Проект договора docx»: в именах файлов вместо пробелов часто «_» и «-»
  const nm = name.replace(/[_.-]+/g, ' ')
  const head = nm + '\n' + text.slice(0, 3000)
  for (const [re, t] of CLASS_RULES) if (re.test(nm)) return t
  for (const [re, t] of CLASS_RULES) if (re.test(head)) return t
  return 'Прочее'
}

// ---------- Точка входа ----------

/**
 * Имена файлов в ZIP без флага UTF-8: архиваторы Windows (проводник, старый WinRAR/7-Zip) пишут кириллицу в CP866.
 * Если байты — валидный UTF-8, берём его, иначе декодируем как CP866.
 */
function zipFileName(bytes: string[] | Uint8Array | ArrayBuffer): string {
  const u8 = Array.isArray(bytes) ? Uint8Array.from(bytes, (c) => c.charCodeAt(0) & 0xff) : new Uint8Array(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8)
  } catch {
    return new TextDecoder('ibm866').decode(u8)
  }
}

const MAX_FILES = 100
const MAX_BYTES = 500 * 1024 * 1024

export async function readFiles(input: File[], s: Settings | null, progress: Progress): Promise<{ files: DocFile[]; warnings: string[] }> {
  const warnings: string[] = []
  const total = input.reduce((a, f) => a + f.size, 0)
  if (total > MAX_BYTES) warnings.push('Превышен лимит 500 МБ на пакет — часть файлов может не обработаться')
  const list: { name: string; path?: string; blob: Blob }[] = []
  for (const f of input) {
    if (ext(f.name) === 'zip') {
      progress(`Распаковка ${f.name}`)
      try {
        const zip = await JSZip.loadAsync(f, { decodeFileName: zipFileName })
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || /(^|\/)(__MACOSX|\.)/.test(entry.name)) continue
          const blob = await entry.async('blob')
          list.push({ name: entry.name.split('/').pop()!, path: `${f.name}/${entry.name}`, blob })
        }
      } catch (e) {
        warnings.push(`${f.name}: не удалось распаковать — ${(e as Error).message}`)
      }
    } else list.push({ name: f.name, blob: f })
  }
  if (list.length > MAX_FILES) {
    warnings.push(`В пакете ${list.length} файлов, обработаны первые ${MAX_FILES}`)
    list.length = MAX_FILES
  }
  const files: DocFile[] = []
  let i = 0
  for (const item of list) {
    i++
    progress(`Распознавание ${i}/${list.length}: ${item.name}`)
    const df = await readOne(item.name, item.blob, s, progress)
    df.path = item.path
    files.push(df)
  }
  return { files, warnings }
}

export async function readOne(name: string, blob: Blob, s: Settings | null, progress: Progress): Promise<DocFile> {
  const e = ext(name)
  const warnings: string[] = []
  let pages: DocPage[] = []
  try {
    if (e === 'pdf') {
      const r = await readPdf(await blob.arrayBuffer(), name, s, progress)
      pages = r.pages
      warnings.push(...r.warnings)
    } else if (e === 'docx') pages = splitPages(await readDocx(await blob.arrayBuffer()))
    else if (e === 'odt') pages = splitPages(await readOdt(await blob.arrayBuffer()))
    else if (e === 'rtf') pages = splitPages(readRtf(await blob.text()))
    else if (e === 'doc') {
      pages = splitPages(readLegacyDoc(await blob.arrayBuffer()))
      warnings.push('Формат DOC (старый Word) читается упрощённо — для точности сохраните как DOCX или PDF')
    } else if (['xlsx', 'xls', 'ods', 'xlsm'].includes(e)) pages = readSheet(await blob.arrayBuffer())
    else if (e === 'csv') pages = splitPages(await blob.text())
    else if (['txt', 'md', 'json', 'xml', 'html', 'htm'].includes(e)) {
      let t = await blob.text()
      if (e === 'html' || e === 'htm') t = htmlToText(t)
      pages = splitPages(t)
    } else if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'heic', 'heif', 'tif', 'tiff'].includes(e)) {
      try {
        const url = await imageToDataUrl(blob)
        if (!s || (!s.apiKey && !s.baseUrl)) warnings.push('Изображение: для OCR нужен AI (Настройки)')
        else {
          progress(`OCR: ${name}`)
          const r = await ocrImage(s, url, name)
          pages = [{ n: 1, text: r.text, ocr: true, confidence: r.confidence }]
          if (r.confidence < 80) warnings.push(`Низкая уверенность распознавания (${r.confidence}%) — проверьте вручную`)
        }
      } catch (err) {
        warnings.push(
          ['heic', 'heif', 'tif', 'tiff'].includes(e)
            ? `Формат ${e.toUpperCase()} не поддерживается браузером — сконвертируйте в JPG/PNG/PDF`
            : `Ошибка распознавания изображения: ${(err as Error).message}`,
        )
      }
    } else if (['rar', '7z'].includes(e)) warnings.push(`Архивы ${e.toUpperCase()} — во второй очереди; используйте ZIP`)
    else if (['dwg', 'dxf'].includes(e)) warnings.push('DWG/DXF — во второй очереди; загрузите чертёж в PDF или как изображение')
    else warnings.push('Неподдерживаемый формат')
  } catch (err) {
    warnings.push(`Ошибка чтения: ${(err as Error).message}`)
  }
  pages = pages.filter((p) => p.text.trim().length > 0 || p.ocr)
  if (!pages.length && !warnings.length) warnings.push('Текст не найден (пустой файл или скан без OCR)')
  const allText = pages.map((p) => p.text).join('\n')
  return {
    id: uid('f'),
    name,
    size: blob.size,
    docType: classify(name, allText),
    pages,
    warnings,
    addedAt: new Date().toISOString(),
  }
}

export function textFile(name: string, text: string): DocFile {
  const pages = splitPages(text)
  return { id: uid('f'), name, size: text.length, docType: classify(name, text), pages, warnings: [], addedAt: new Date().toISOString() }
}
