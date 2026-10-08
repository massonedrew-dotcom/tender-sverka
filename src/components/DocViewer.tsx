import { useEffect, useRef, useState } from 'react'
import type { DocFile } from '../types'
import { highlightRange } from '../lib/text'
import { Highlighted, Modal } from './ui'
import type { T } from '../i18n'

export interface DocTarget { fileId?: string; fileName: string; page: number; quote?: string }

/** Просмотр источника: страница документа с подсвеченной цитатой. */
export function DocViewer({ files, target, onClose, t }: { files: DocFile[]; target: DocTarget; onClose: () => void; t: T }) {
  const file = files.find((f) => f.id === target.fileId) ?? files.find((f) => f.name === target.fileName)
  const [page, setPage] = useState(target.page)
  const ref = useRef<HTMLDivElement>(null)
  const p = file?.pages.find((x) => x.n === page)
  const { quote, page: targetPage } = target
  const range = p && quote && page === targetPage ? highlightRange(p.text, quote) : null
  useEffect(() => {
    ref.current?.querySelector('mark[data-hl]')?.scrollIntoView({ block: 'center' })
  }, [p, quote, page, targetPage])

  return (
    <Modal title={`${target.fileName} · ${t('pages')} ${page}`} onClose={onClose} wide>
      {!file ? (
        <div className="text-sm text-slate-500">{t('notFound')}</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{file.docType}</span>
            {file.path && <span className="text-xs text-slate-500">{file.path}</span>}
            <div className="ml-auto flex items-center gap-1">
              <button className="rounded border px-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
              <select className="rounded border px-1 py-0.5 text-sm" value={page} onChange={(e) => setPage(Number(e.target.value))}>
                {file.pages.map((x) => <option key={x.n} value={x.n}>{t('pages')} {x.n}</option>)}
              </select>
              <button className="rounded border px-2 disabled:opacity-40" disabled={page >= file.pages.length} onClick={() => setPage(page + 1)}>›</button>
            </div>
          </div>
          {p?.ocr && <div className="mb-2 text-xs text-slate-500">OCR · {t('confidence')}: {p.confidence ?? '?'}%</div>}
          <div ref={ref} className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed">
            {p ? <Highlighted text={p.text} range={range} /> : '—'}
          </div>
          {target.quote && !range && page === target.page && <div className="mt-2 text-xs text-orange-700">⚠ {t('quoteNotFound')}: «{target.quote}»</div>}
        </>
      )}
    </Modal>
  )
}
