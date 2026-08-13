import type * as Types from '@app/types.ts'
import Helper from '@app/helper.ts'

export default class Session {
  private static readonly maxPending = 5
  private static readonly maxHistory = 10
  private static readonly maxDeclined = 5
  private pending: Types.InlineEdit[] = []
  private history: Types.InlineEdit[] = []
  private declined: Types.InlineEdit[] = []
  private rejected = new Set<string>()

  accept(edit: Types.InlineEdit): void {
    this.pending = this.pending.filter((pending) => !Session.isSame(pending, edit))
  }

  commit(edit: Types.InlineEdit): void {
    if (this.history.some((entry) => Session.isSame(entry, edit))) {
      return
    }
    const merged = this.coalesce(edit)
    if (merged) {
      return
    }
    this.history.push(edit)
    if (this.history.length > Session.maxHistory) {
      this.history.shift()
    }
  }

  getDeclined(): Types.InlineEdit[] {
    return this.declined
  }

  getHistory(): Types.InlineEdit[] {
    return this.history
  }

  getPending(): Types.InlineEdit[] {
    return this.pending
  }

  isFull(): boolean {
    return this.pending.length >= Session.maxPending
  }

  ordered(line: number): Types.InlineEdit[] {
    const rank = (edit: Types.InlineEdit): number => {
      const onLine = line >= edit.old.range.start.line && line <= edit.old.range.end.line
      return onLine ? -1 : Math.abs(edit.old.range.start.line - line)
    }
    return [...this.pending].sort((left, right) => rank(left) - rank(right))
  }

  prune(content: string): void {
    const lines = content.split('\n')
    this.pending = this.pending.filter((edit) =>
      Session.rangeMatches(lines, edit) && edit.old.text !== edit.new.text
    )
  }

  push(edit: Types.InlineEdit): boolean {
    if (edit.old.text === edit.new.text) {
      return false
    }
    if (this.pending.length >= Session.maxPending) {
      return false
    }
    if (this.isKnown(edit)) {
      return false
    }
    this.pending.push(edit)
    return true
  }

  reanchor(changes: readonly Types.TextDocumentContentChangeEvent[]): void {
    if (this.pending.length === 0) {
      return
    }
    for (const change of changes) {
      const endLine = change.range.end.line
      const removedLines = endLine - change.range.start.line
      const addedLines = change.text.split('\n').length - 1
      const delta = addedLines - removedLines
      if (delta === 0) {
        continue
      }
      for (const edit of this.pending) {
        if (edit.old.range.start.line <= endLine) {
          continue
        }
        edit.old.range.start.line += delta
        edit.old.range.end.line += delta
        edit.new.range.start.line += delta
        edit.new.range.end.line += delta
      }
    }
  }

  reject(edit: Types.InlineEdit): void {
    this.pending = []
    this.rejected.add(Session.signature(edit))
    this.declined.push(edit)
    if (this.declined.length > Session.maxDeclined) {
      this.declined.shift()
    }
  }

  reset(): void {
    this.pending = []
    this.history = []
    this.declined = []
    this.rejected.clear()
  }

  private coalesce(edit: Types.InlineEdit): boolean {
    const last = this.history[this.history.length - 1]
    if (!last) {
      return false
    }
    const sameLine = last.old.range.start.line === edit.old.range.start.line &&
      last.old.range.end.line === last.old.range.start.line &&
      edit.old.range.end.line === edit.old.range.start.line &&
      last.new.range.end.line === last.new.range.start.line
    if (!sameLine) {
      return false
    }
    if (edit.old.text !== last.new.text && !edit.old.text.startsWith(last.new.text)) {
      const appendPoint = last.new.range.end.character
      const isAppend = edit.old.range.start.character >= last.new.range.start.character &&
        edit.old.range.start.character <= appendPoint + 1
      if (!isAppend) {
        return false
      }
    }
    last.new = edit.new
    return true
  }

  private isKnown(candidate: Types.InlineEdit): boolean {
    if (this.rejected.has(Session.signature(candidate))) {
      return true
    }
    const inPending = this.pending.some((edit) => Session.isSame(edit, candidate))
    const inHistory = this.history.some((edit) => Session.isSame(edit, candidate))
    if (inPending || inHistory) {
      return true
    }
    return this.pending.some(
      (edit) =>
        edit.old.range.start.line === candidate.old.range.start.line &&
        edit.new.text.trim() === candidate.new.text.trim() &&
        candidate.new.text.trim().length > 0
    )
  }

  private static isSame(
    left: Types.InlineEdit,
    right: Types.InlineEdit
  ): boolean {
    return (
      left.old.range.start.line === right.old.range.start.line &&
      left.old.range.start.character === right.old.range.start.character &&
      left.old.range.end.line === right.old.range.end.line &&
      left.old.range.end.character === right.old.range.end.character &&
      left.new.text === right.new.text
    )
  }

  private static rangeMatches(
    lines: string[],
    edit: Types.InlineEdit
  ): boolean {
    const { start, end } = edit.old.range
    if (start.line < 0 || end.line >= lines.length) {
      return false
    }
    return Helper.sliceRange(lines, edit.old.range) === edit.old.text
  }

  private static signature(edit: Types.InlineEdit): string {
    const { start, end } = edit.old.range
    return `${start.line}:${start.character}:${end.line}:${end.character}:${edit.new.text}`
  }
}
