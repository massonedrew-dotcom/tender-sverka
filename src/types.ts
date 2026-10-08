// Модель данных «Тендер-Сверки» (см. ТЗ, разделы 4.3, 6, 7, 8)

export type Lang = 'ru' | 'uz' | 'en'
export type PkgKind = 'customer' | 'participant'

export interface DocPage {
  n: number
  text: string
  /** Текст получен распознаванием изображения (OCR через мультимодальную LLM) */
  ocr?: boolean
  /** Уверенность распознавания 0–100 */
  confidence?: number
}

export interface DocFile {
  id: string
  name: string
  /** Путь внутри архива, если файл распакован из ZIP */
  path?: string
  size: number
  docType: string
  pages: DocPage[]
  warnings: string[]
  addedAt: string
  /** Файл добавлен как разъяснение/изменение документации или как исправление заявки */
  isAmendment?: boolean
  /** Загружен, но ещё не учтён в чек-листе / проверке */
  pending?: boolean
}

export type Scope = 'product' | 'participant'
export type ReqType = 'mandatory' | 'scored' | 'desired'
export type Operator = '>=' | '<=' | '=' | 'range' | 'tolerance' | 'exists' | 'text' | 'date'

export interface SourceRef {
  fileId?: string
  fileName: string
  page: number
  clause?: string
  quote: string
  /** Перевод цитаты на язык отчёта, если исходник на другом языке */
  translation?: string
}

export interface Requirement {
  id: string // T-014 / U-007
  scope: Scope
  category: string
  lotItem?: string
  parameter: string
  operator: Operator
  value?: string
  valueMax?: string
  unit?: string
  type: ReqType
  proof?: string
  consequence?: string
  source: SourceRef
  confidence: number
  quoteVerified: boolean
  /** Баллы из критериев оценки (для оценочных требований) */
  points?: number
  restrictive?: string
  /** Исключено пользователем/системой из сравнения */
  excluded?: boolean
  manual?: boolean
  /** Пункт изменён разъяснением/изменением документации */
  changeNote?: string
}

export type Status = 'ok' | 'partial' | 'unconfirmed' | 'fail' | 'review'

export type ActionType = 'add_doc' | 'fix_data' | 'replace_product' | 'ask_customer' | 'unfixable'

export interface Recommendation {
  problem: string
  action: string
  actionType: ActionType
  criticality: 'high' | 'medium' | 'low'
  done?: boolean
}

export interface Match {
  reqId: string
  status: Status
  /** Статус до ручной правки */
  aiStatus: Status
  claimed: string
  claimedValue?: string
  claimedUnit?: string
  confirmedByDoc: boolean
  sourceKind?: 'official' | 'certificate' | 'proposal' | 'marketing' | 'other'
  validUntil?: string
  source?: SourceRef
  rationale: string
  confidence: number
  method: 'rule' | 'llm' | 'manual'
  ruleNote?: string
  manualComment?: string
  recommendation?: Recommendation
  /** Сильная сторона: превышение требования */
  exceeds?: boolean
}

export interface Fact {
  scope: Scope
  category: string
  parameter: string
  value: string
  source: SourceRef
}

export interface Contradiction {
  text: string
  sources: SourceRef[]
}

export interface Version {
  at: string
  label: string
  score: number
  scoreMin: number
  scoreMax: number
  product: number
  participant: number
  verdict: Verdict
  changes: string[]
}

export type Verdict = 'ready' | 'needs_work' | 'risk'

export interface Analysis {
  summary: string
  strengths: string[]
  risks: string[]
  generatedAt: string
}

export interface Participant {
  id: string
  name: string
  inn?: string
  files: DocFile[]
  facts: Fact[]
  contradictions: Contradiction[]
  matches: Record<string, Match>
  versions: Version[]
  analysis?: Analysis
}

export interface Question {
  id: string
  kind: 'contradiction' | 'ambiguity' | 'restrictive'
  text: string
  sources: SourceRef[]
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  at: string
}

export interface LogEntry {
  at: string
  text: string
}

export interface Project {
  id: string
  name: string
  lotNumber: string
  customer: string
  /** Дата окончания приёма заявок (YYYY-MM-DD) */
  deadline: string
  createdAt: string
  updatedAt: string
  isDemo?: boolean
  customerFiles: DocFile[]
  requirements: Requirement[]
  questions: Question[]
  checklistApproved: boolean
  participants: Participant[]
  activeParticipantId?: string
  chat: ChatMsg[]
  log: LogEntry[]
  clarificationDraft?: string
}

export interface Settings {
  provider: 'openai' | 'anthropic'
  apiKey: string
  model: string
  baseUrl: string
  reviewThreshold: number
  weights: Record<ReqType, number>
  k: Record<Exclude<Status, 'review'>, number>
  reportLang: Lang
  uiLang: Lang
  /** Макс. число страниц-изображений на файл для OCR */
  ocrPageLimit: number
}
