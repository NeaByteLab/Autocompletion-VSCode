import type * as Types from '@app/types.ts'
import * as Vscode from 'vscode'
import Diff from '@app/diff.ts'

export default class Helper {
  static readonly itemEdits = new WeakMap<Vscode.InlineCompletionItem, Types.InlineEdit>()

  static affix(oldText: string, newText: string): Types.AffixSpan {
    let prefix = 0
    const max = Math.min(oldText.length, newText.length)
    while (prefix < max && oldText[prefix] === newText[prefix]) {
      prefix++
    }
    let suffix = 0
    while (
      suffix < max - prefix &&
      oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) {
      suffix++
    }
    return { prefix, suffix }
  }

  static deriveEdits(previous: string, current: string): Types.InlineEdit[] {
    if (previous === current) {
      return []
    }
    const prevLines = previous.split('\n')
    const currLines = current.split('\n')
    const output = Diff.compute(previous, current)
    const edits: Types.InlineEdit[] = []
    let oldLine = 0
    let newLine = 0
    let removed: string[] = []
    let added: string[] = []
    let oldStart = 0
    let newStart = 0
    let open = false
    const flush = (): void => {
      if (!open) {
        return
      }
      open = false
      const edit = Helper.toEdit(removed, added, oldStart, newStart, prevLines, currLines)
      if (edit) {
        edits.push(edit)
      }
      removed = []
      added = []
    }
    for (const entry of output.edits) {
      if (entry.type === 'equal') {
        flush()
        oldLine++
        newLine++
        continue
      }
      if (!open) {
        open = true
        oldStart = oldLine
        newStart = newLine
      }
      if (entry.type === 'delete') {
        removed.push(entry.oldLine?.text ?? '')
        oldLine++
        continue
      }
      added.push(entry.newLine?.text ?? '')
      newLine++
    }
    flush()
    return edits
  }

  static isAccept(event: Types.TextDocumentChangeEvent, edit: Types.InlineEdit): boolean {
    const changes = event.contentChanges ?? []
    return changes.some((change) => Helper.isEdit(change, edit))
  }

  static isEdit(
    change: Types.TextDocumentContentChangeEvent,
    edit: Types.InlineEdit
  ): boolean {
    const changeStart = change.range.start
    const changeEnd = change.range.end
    if (
      changeStart.line < edit.old.range.start.line ||
      changeEnd.line > edit.old.range.end.line
    ) {
      return false
    }
    if (change.text === edit.new.text || edit.new.text.startsWith(change.text)) {
      return true
    }
    return edit.new.text.includes(change.text) && change.text.length > 0
  }

  static serializeRange(range: Types.SpanRange): string {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`
  }

  static sliceRange(lines: string[], range: Types.SpanRange): string {
    const { start, end } = range
    if (start.line === end.line) {
      return (lines[start.line] ?? '').slice(start.character, end.character)
    }
    let out = `${(lines[start.line] ?? '').slice(start.character)}\n`
    for (let line = start.line + 1; line < end.line; line++) {
      out += `${lines[line] ?? ''}\n`
    }
    out += (lines[end.line] ?? '').slice(0, end.character)
    return out
  }

  static toItem(
    edit: Types.InlineEdit,
    position: Types.Position
  ): Types.InlineCompletionItem {
    const range = Helper.toRange(edit.old.range)
    const start = range.start
    const end = range.end
    const item = new Vscode.InlineCompletionItem(edit.new.text, range)
    const isPureExtension = edit.old.text === '' || edit.new.text.startsWith(edit.old.text)
    const onCursorLine = start.line === position.line && end.line === position.line
    if (onCursorLine && isPureExtension && position.isAfterOrEqual(end)) {
      Helper.itemEdits.set(item, edit)
      return item
    }
    item.isInlineEdit = true
    const before = position.isBeforeOrEqual(start) ? position : start
    const after = position.isAfterOrEqual(end) ? position : end
    item.showRange = new Vscode.Range(before, after)
    Helper.itemEdits.set(item, edit)
    return item
  }

  static toRange(range: Types.SpanRange): Vscode.Range {
    return new Vscode.Range(
      new Vscode.Position(range.start.line, range.start.character),
      new Vscode.Position(range.end.line, range.end.character)
    )
  }

  private static toEdit(
    removed: string[],
    added: string[],
    oldStart: number,
    newStart: number,
    prevLines: string[],
    currLines: string[]
  ): Types.InlineEdit | null {
    const oldText = removed.join('\n')
    const newText = added.join('\n')
    if (oldText === newText) {
      return null
    }
    const oldEndLine = removed.length > 0 ? oldStart + removed.length - 1 : oldStart
    const newEndLine = added.length > 0 ? newStart + added.length - 1 : newStart
    const oldEndCharacter = removed.length > 0 ? (removed[removed.length - 1] ?? '').length : 0
    const newEndCharacter = added.length > 0 ? (added[added.length - 1] ?? '').length : 0
    if (oldStart >= prevLines.length && removed.length > 0) {
      return null
    }
    if (newStart >= currLines.length && added.length > 0) {
      return null
    }
    return {
      old: {
        text: oldText,
        range: {
          start: { line: oldStart, character: 0 },
          end: { line: oldEndLine, character: oldEndCharacter }
        }
      },
      new: {
        text: newText,
        range: {
          start: { line: newStart, character: 0 },
          end: { line: newEndLine, character: newEndCharacter }
        }
      }
    }
  }
}
