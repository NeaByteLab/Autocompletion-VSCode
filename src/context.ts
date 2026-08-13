import type * as Types from '@app/types.ts'

export default class Context {
  private static readonly severityError = 0
  private static readonly severityWarning = 1
  private static readonly maxDiagnostics = 10

  static formatDiagnostics(diagnostics: Types.DiagnosticLike[], cursorLine: number): string {
    const relevant = diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.severity === Context.severityError ||
          diagnostic.severity === Context.severityWarning
      )
      .sort(
        (left, right) =>
          Math.abs(left.range.start.line - cursorLine) -
          Math.abs(right.range.start.line - cursorLine)
      )
      .slice(0, Context.maxDiagnostics)
    if (relevant.length === 0) {
      return ''
    }
    return relevant
      .map((diagnostic) => {
        const label = diagnostic.severity === Context.severityError ? 'Error' : 'Warning'
        const message = diagnostic.message.replace(/\s+/g, ' ').trim()
        return `L${diagnostic.range.start.line + 1} [${label}] ${message}`
      })
      .join('\n')
  }

  static formatEdits(edits: Types.InlineEdit[]): string {
    if (edits.length === 0) {
      return ''
    }
    return edits
      .map((edit) => {
        const line = edit.old.range.start.line + 1
        const removed = edit.old.text.split('\n').map((text) => `-|${text}`)
        if (edit.new.text === '') {
          return [`@@ ${line} (deleted)`, ...removed].join('\n')
        }
        const added = edit.new.text.split('\n').map((text) => `+|${text}`)
        return [`@@ ${line}`, ...removed, ...added].join('\n')
      })
      .join('\n')
  }
}
