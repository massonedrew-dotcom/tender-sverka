import { useState } from 'react'
import type { Lang, Settings } from '../types'
import { LANG_NAMES, makeT, typeLabel, stLabel } from '../i18n'
import { DEFAULT_SETTINGS, MODEL_PRESETS } from '../lib/settings'
import { testConnection } from '../lib/pipeline'
import { DEFAULT_K, DEFAULT_WEIGHTS } from '../lib/scoring'
import { Btn, Modal } from './ui'

const W_KEYS = ['mandatory', 'scored', 'desired'] as const
const K_KEYS = ['ok', 'partial', 'unconfirmed', 'fail'] as const

/** Пустое поле хранится как NaN (а не 0), чтобы его можно было стереть и ввести заново */
const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
const shown = (n: number) => (Number.isFinite(n) ? n : '')
const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max

/** Пустые и некорректные числа заменяются значениями по умолчанию */
function sanitize(s: Settings): Settings {
  const weights = { ...s.weights }
  for (const k of W_KEYS) if (!inRange(weights[k], 0.01, 1000)) weights[k] = DEFAULT_WEIGHTS[k]
  const k = { ...s.k }
  for (const x of K_KEYS) if (!inRange(k[x], 0, 1)) k[x] = DEFAULT_K[x]
  return {
    ...s,
    weights,
    k,
    reviewThreshold: inRange(s.reviewThreshold, 0, 100) ? s.reviewThreshold : DEFAULT_SETTINGS.reviewThreshold,
    ocrPageLimit: inRange(s.ocrPageLimit, 1, 1000) ? Math.round(s.ocrPageLimit) : DEFAULT_SETTINGS.ocrPageLimit,
  }
}

export function SettingsModal({ settings, onSave, onClose }: { settings: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [s, setS] = useState<Settings>(settings)
  const [test, setTest] = useState<string>('')
  const t = makeT(s.uiLang)
  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600'

  return (
    <Modal title={t('settings')} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('uiLang')}</label>
            <select className={inp} value={s.uiLang} onChange={(e) => setS({ ...s, uiLang: e.target.value as Lang })}>
              {Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>{t('reportLang')}</label>
            <select className={inp} value={s.reportLang} onChange={(e) => setS({ ...s, reportLang: e.target.value as Lang })}>
              {Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t('provider')}</label>
              <select className={inp} value={s.provider} onChange={(e) => {
                const provider = e.target.value as Settings['provider']
                setS({ ...s, provider, model: MODEL_PRESETS[provider][0] })
              }}>
                <option value="openai">OpenAI (ChatGPT)</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </div>
            <div>
              <label className={lbl}>{t('model')}</label>
              <input className={inp} list="models" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
              <datalist id="models">{MODEL_PRESETS[s.provider].map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          </div>
          <div className="mt-3">
            <label className={lbl}>{t('apiKey')}</label>
            <input className={inp} type="password" autoComplete="off" placeholder={s.provider === 'openai' ? 'sk-…' : 'sk-ant-…'} value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value.trim() })} />
            <p className="mt-1 text-xs text-slate-500">{t('apiKeyHint')}</p>
          </div>
          <div className="mt-3">
            <label className={lbl}>{t('baseUrl')}</label>
            <input className={inp} placeholder="https://tender-proxy.<you>.workers.dev" value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value.trim() })} />
            <p className="mt-1 text-xs text-slate-500">{t('baseUrlHint')}</p>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Btn onClick={async () => {
              setTest('…')
              try {
                await testConnection(sanitize(s))
                setTest('✓ ' + t('connOk'))
              } catch (e) {
                setTest('✗ ' + (e as Error).message)
              }
            }}>{t('testConn')}</Btn>
            <span className={`text-xs ${test.startsWith('✓') ? 'text-green-700' : 'text-red-700'}`}>{test}</span>
          </div>
        </div>

        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">{t('weights')} · {t('kcoef')} · {t('reviewThreshold')}</summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {W_KEYS.map((k) => (
              <div key={k}>
                <label className={lbl}>w · {typeLabel(t, k)}</label>
                <input className={inp} type="number" step="0.5" value={shown(s.weights[k])} onChange={(e) => setS({ ...s, weights: { ...s.weights, [k]: num(e.target.value) } })} />
              </div>
            ))}
            {K_KEYS.map((k) => (
              <div key={k}>
                <label className={lbl}>k · {stLabel(t, k)}</label>
                <input className={inp} type="number" step="0.1" min="0" max="1" value={shown(s.k[k])} onChange={(e) => setS({ ...s, k: { ...s.k, [k]: num(e.target.value) } })} />
              </div>
            ))}
            <div>
              <label className={lbl}>{t('reviewThreshold')}</label>
              <input className={inp} type="number" min="0" max="100" value={shown(s.reviewThreshold)} onChange={(e) => setS({ ...s, reviewThreshold: num(e.target.value) })} />
            </div>
            <div>
              <label className={lbl}>{t('ocrLimit')}</label>
              <input className={inp} type="number" min="1" max="1000" value={shown(s.ocrPageLimit)} onChange={(e) => setS({ ...s, ocrPageLimit: num(e.target.value) })} />
            </div>
          </div>
          <button className="mt-2 text-xs text-blue-700 underline" onClick={() => setS({ ...s, weights: { ...DEFAULT_WEIGHTS }, k: { ...DEFAULT_K }, reviewThreshold: DEFAULT_SETTINGS.reviewThreshold })}>
            ↺ {t('resetDefaults')}
          </button>
        </details>

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>{t('cancel')}</Btn>
          <Btn kind="primary" onClick={() => onSave(sanitize(s))}>{t('save')}</Btn>
        </div>
      </div>
    </Modal>
  )
}
