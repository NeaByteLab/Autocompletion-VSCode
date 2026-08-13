export interface AffixSpan {
  prefix: number
  suffix: number
}

export interface AlgorithmState {
  readonly diagonal: BipolarArray<number>
  readonly depth: number
}

export interface ApiConfig {
  url: string
  model: string
  apiKey: string
}

export interface BipolarArray<T> {
  get(index: number): T
  set(index: number, value: T): void
  copy(): BipolarArray<T>
}

export interface DiagnosticLike {
  message: string
  severity: number
  range: { start: { line: number } }
  source?: string
}

export interface DiffContent {
  added: string[]
  removed: string[]
  raw: string
}

export interface DiffEdit {
  readonly type: DiffOperation
  readonly oldLine: DiffLine | undefined
  readonly newLine: DiffLine | undefined
}

export interface DiffHunk {
  path: string
  lineNumber: number
  content: DiffContent
}

export interface DiffLine {
  readonly number: number
  readonly text: string
}

export interface DiffOutput {
  readonly edits: DiffEdit[]
  readonly editDistance: number
}

export interface EditContext {
  path: string
  language: string
  content: string
  line: number
  problem?: string
  history?: string
  declined?: string
}

export interface InlineEdit {
  old: TextRange
  new: TextRange
}

export interface LinePosition {
  line: number
  character: number
}

export interface RequestBody {
  model: string
  instructions: string
  input: string
  prompt_cache_key: string
  reasoning: { effort: string }
  stream: boolean
}

export interface RunHandle {
  abort: () => void
  done: Promise<void>
}

export interface StreamEvent {
  type: string
  delta?: string
}

export interface TextRange {
  text: string
  range: {
    start: LinePosition
    end: LinePosition
  }
}

export type * from 'vscode'

export type DiffOperation = 'equal' | 'delete' | 'insert'

export type HunkState = Partial<DiffHunk>

export type LineMatcher = (source: string, target: string) => boolean

export type OperationCallback = (diff: DiffHunk) => void

export type SpanRange = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}
