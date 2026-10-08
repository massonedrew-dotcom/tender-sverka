// Нормализация текста, проверка и поиск цитат (защита от галлюцинаций, ТЗ раздел 10)
import type { DocFile, SourceRef } from '../types'

const normChar = (c: string) => {
  const l = c.toLowerCase()
  if ('«»“”„"\'`‘’ʻʼ'.includes(l)) return ''
  if ('–—‑−'.includes(l)) return '-'
  if (l === 'ё') return 'е'
  return l
}

/** Нормализует строку и возвращает карту индексов в оригинал. */
export function normalizeWithMap(s: string): { n: string; map: number[] } {
  let n = ''
  const map: number[] = []
  let prevSpace = true
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (/\s/.test(c) || c === '|') {
      if (!prevSpace) {
        n += ' '
        map.push(i)
        prevSpace = true
      }
      continue
    }
    const m = normChar(c)
    if (!m) continue
    n += m
    map.push(i)
    prevSpace = false
  }
  return { n: n.trim(), map }
}

export const norm = (s: string) => normalizeWithMap(s).n

/** Слова без пунктуации — одинаковая нормализация для текста и цитаты («16 GB,» ≡ «16 GB»). */
const words = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0)

/**
 * Насколько цитата присутствует в тексте: 1 — дословно (с точностью до регистра, пробелов, кавычек и пунктуации),
 * иначе доля совпавших биграмм слов. Короткие цитаты (< 4 слов или < 20 символов) подтверждаются только
 * точным вхождением — частичное совпадение у них ничего не доказывает.
 */
export function fuzzyScore(text: string, quote: string): number {
  const qw = words(quote)
  if (qw.length === 0) return 0
  if (norm(text).includes(norm(quote))) return 1
  const t = ` ${words(text).join(' ')} `
  if (t.includes(` ${qw.join(' ')} `)) return 1
  if (qw.length < 4 || norm(quote).length < 20) return 0
  let hit = 0
  for (let i = 0; i < qw.length - 1; i++) if (t.includes(` ${qw[i]} ${qw[i + 1]} `)) hit++
  return hit / (qw.length - 1)
}

export interface Located { fileId: string; fileName: string; page: number; score: number }

/** Ищет цитату: сначала на указанной странице, затем по всему файлу, затем по всем файлам. */
export function locateQuote(files: DocFile[], ref: SourceRef): Located | null {
  if (!ref.quote || ref.quote.trim().length < 3) return null
  const byName = files.find((f) => f.id === ref.fileId) ?? files.find((f) => f.name === ref.fileName) ?? files.find((f) => ref.fileName && f.name.toLowerCase().includes(ref.fileName.toLowerCase()))
  const check = (f: DocFile, pageN: number) => {
    const p = f.pages.find((x) => x.n === pageN)
    return p ? fuzzyScore(p.text, ref.quote) : 0
  }
  if (byName) {
    const s = check(byName, ref.page)
    if (s >= 0.7) return { fileId: byName.id, fileName: byName.name, page: ref.page, score: s }
    let best: Located | null = null
    for (const p of byName.pages) {
      const sc = fuzzyScore(p.text, ref.quote)
      if (sc >= 0.7 && (!best || sc > best.score)) best = { fileId: byName.id, fileName: byName.name, page: p.n, score: sc }
    }
    if (best) return best
  }
  let best: Located | null = null
  for (const f of files)
    for (const p of f.pages) {
      const sc = fuzzyScore(p.text, ref.quote)
      if (sc >= 0.7 && (!best || sc > best.score)) best = { fileId: f.id, fileName: f.name, page: p.n, score: sc }
    }
  return best
}

/** Находит фрагмент цитаты в оригинальном тексте страницы для подсветки. */
export function highlightRange(text: string, quote: string): [number, number] | null {
  if (!quote) return null
  const { n, map } = normalizeWithMap(text)
  const q = norm(quote)
  let idx = n.indexOf(q)
  let len = q.length
  if (idx < 0) {
    // ищем самый длинный общий фрагмент из слов цитаты
    const qw = q.split(' ')
    let bestI = -1
    let bestL = 0
    for (let a = 0; a < qw.length; a++) {
      for (let b = qw.length; b > a + bestL; b--) {
        const frag = qw.slice(a, b).join(' ')
        if (frag.length < 6) break
        const i = n.indexOf(frag)
        if (i >= 0) {
          if (b - a > bestL) {
            bestL = b - a
            bestI = i
            len = frag.length
          }
          break
        }
      }
    }
    if (bestI < 0) return null
    idx = bestI
  }
  const start = map[idx]
  const end = map[Math.min(idx + len - 1, map.length - 1)] + 1
  return [start, end]
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

/** Формирует текст пакета с маркерами файлов и страниц для LLM. */
export function packText(files: DocFile[], maxChars = 400_000): { text: string; truncated: boolean } {
  let out = ''
  let truncated = false
  for (const f of files) {
    const head = `\n\n===== ФАЙЛ: "${f.name}" | тип: ${f.docType} =====\n`
    out += head
    for (const p of f.pages) {
      const chunk = `\n--- [${f.name}, стр. ${p.n}]${p.ocr ? ` (OCR, уверенность ${p.confidence ?? '?'}%)` : ''} ---\n${p.text}\n`
      if (out.length + chunk.length > maxChars) {
        truncated = true
        break
      }
      out += chunk
    }
    if (truncated) break
  }
  return { text: out, truncated }
}

/** Делит пакет на чанки по страницам (для длинной документации). */
export function chunkFiles(files: DocFile[], maxChars = 90_000): string[] {
  const chunks: string[] = []
  let cur = ''
  for (const f of files) {
    for (const p of f.pages) {
      const head = `\n--- [${f.name}, стр. ${p.n}] (тип: ${f.docType}) ---\n`
      // Очень длинная «страница» (большой лист XLSX) делится на части с тем же маркером, без потери текста
      const room = Math.max(1000, maxChars - head.length - 1)
      let off = 0
      do {
        let end = Math.min(p.text.length, off + room)
        if (end < p.text.length) {
          const nl = p.text.lastIndexOf('\n', end)
          if (nl > off) end = nl + 1 // режем по границе строки
        }
        const piece = `${head}${p.text.slice(off, end)}\n`
        if (cur.length + piece.length > maxChars && cur) {
          chunks.push(cur)
          cur = ''
        }
        cur += piece
        off = end
      } while (off < p.text.length)
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(+d)) return iso
  return d.toLocaleDateString('ru-RU')
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(+d)) return iso
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}
