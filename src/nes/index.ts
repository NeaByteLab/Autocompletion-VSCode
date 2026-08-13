import type * as Types from '@app/types.ts'
import Builder from '@app/nes/builder.ts'
import Parser from '@app/nes/parser.ts'
import Logger from '@app/logger.ts'
import Helper from '@app/helper.ts'

export default class NES {
  static calculate(diff: Types.DiffHunk, content: string): Types.InlineEdit[] {
    const fileLines = content.split('\n')
    const startLine = diff.lineNumber - 1
    if (startLine < 0) {
      return []
    }
    if (startLine >= fileLines.length) {
      return []
    }
    const deleteCount = diff.content.removed.length
    const lastDeletedLine = deleteCount > 0
      ? Math.min(startLine + deleteCount - 1, fileLines.length - 1)
      : startLine
    const endCharacter = deleteCount > 0 ? fileLines[lastDeletedLine]!.length : 0
    const range = {
      start: { line: startLine, character: 0 },
      end: { line: lastDeletedLine, character: endCharacter }
    }
    const oldText = Helper.sliceRange(fileLines, range)
    const newText = NES.alignIndent(diff.content.added, fileLines[startLine] ?? '')
    if (oldText === newText || oldText.trim() === newText.trim()) {
      return []
    }
    if (deleteCount === 0 && newText === '') {
      return []
    }
    if (deleteCount > 0 && diff.content.added.length === 0) {
      return []
    }
    if (deleteCount > 0) {
      const matches = diff.content.removed.every((removedLine, offset) => {
        const fileLine = fileLines[startLine + offset]
        if (fileLine === undefined) {
          return false
        }
        return fileLine.trim() === removedLine.trim()
      })
      if (!matches) {
        return []
      }
    }
    if (startLine === lastDeletedLine) {
      const tight = NES.minimalSpan(oldText, newText, startLine)
      if (tight) {
        return [tight]
      }
    }
    return [
      {
        old: { text: oldText, range: NES.cloneRange(range) },
        new: { text: newText, range: NES.cloneRange(range) }
      }
    ]
  }

  static run(
    config: Types.ApiConfig,
    context: Types.EditContext,
    callback: Types.OperationCallback
  ): Types.RunHandle {
    const controller = new AbortController()
    const done = NES.stream(config, context, callback, controller.signal).catch(
      (error: unknown) => {
        if (NES.isAbort(error)) {
          return
        }
        Logger.error('Stream Failed', error)
      }
    )
    return {
      abort: () => {
        if (!controller.signal.aborted) {
          controller.abort()
        }
      },
      done
    }
  }

  private static alignIndent(added: string[], firstRemoved: string): string {
    if (added.length === 0) {
      return ''
    }
    const first = added[0] ?? ''
    const removedTrimmed = firstRemoved.trimStart()
    const addedTrimmed = first.trimStart()
    if (removedTrimmed === '' || addedTrimmed === '') {
      return added.join('\n')
    }
    const expectedIndent = firstRemoved.slice(0, firstRemoved.length - removedTrimmed.length)
    const actualIndent = first.slice(0, first.length - addedTrimmed.length)
    if (expectedIndent === actualIndent) {
      return added.join('\n')
    }
    return added
      .map((line) => {
        const trimmed = line.trimStart()
        if (trimmed === '') {
          return line
        }
        const lineIndent = line.slice(0, line.length - trimmed.length)
        if (lineIndent.startsWith(actualIndent)) {
          return expectedIndent + lineIndent.slice(actualIndent.length) + trimmed
        }
        return expectedIndent + trimmed
      })
      .join('\n')
  }

  private static cloneRange(range: Types.SpanRange): Types.SpanRange {
    return {
      start: { line: range.start.line, character: range.start.character },
      end: { line: range.end.line, character: range.end.character }
    }
  }

  private static isAbort(error: unknown): boolean {
    return (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: unknown }).name === 'AbortError')
    )
  }

  private static minimalSpan(
    oldText: string,
    newText: string,
    line: number
  ): Types.InlineEdit | null {
    if (oldText === newText) {
      return null
    }
    const { prefix, suffix } = Helper.affix(oldText, newText)
    let oldStart = prefix
    let oldEnd = oldText.length - suffix
    let newStart = prefix
    let newEnd = newText.length - suffix
    const isWord = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
    while (oldStart > 0 && isWord(oldText[oldStart - 1]) && isWord(oldText[oldStart])) {
      oldStart--
    }
    while (newStart > 0 && isWord(newText[newStart - 1]) && isWord(newText[newStart])) {
      newStart--
    }
    const anchorStart = Math.min(oldStart, newStart)
    oldStart = anchorStart
    newStart = anchorStart
    while (oldEnd < oldText.length && isWord(oldText[oldEnd - 1]) && isWord(oldText[oldEnd])) {
      oldEnd++
    }
    while (newEnd < newText.length && isWord(newText[newEnd - 1]) && isWord(newText[newEnd])) {
      newEnd++
    }
    const tailFromEnd = Math.min(oldText.length - oldEnd, newText.length - newEnd)
    oldEnd = oldText.length - tailFromEnd
    newEnd = newText.length - tailFromEnd
    const oldInner = oldText.slice(oldStart, oldEnd)
    const newInner = newText.slice(newStart, newEnd)
    if (oldInner === '' || oldInner === newInner) {
      return null
    }
    if (/\s/.test(oldInner) || /\s/.test(newInner)) {
      return null
    }
    return {
      old: {
        text: oldInner,
        range: {
          start: { line, character: oldStart },
          end: { line, character: oldEnd }
        }
      },
      new: {
        text: newInner,
        range: {
          start: { line, character: newStart },
          end: { line, character: newStart + newInner.length }
        }
      }
    }
  }

  private static async stream(
    config: Types.ApiConfig,
    context: Types.EditContext,
    callback: Types.OperationCallback,
    signal: AbortSignal
  ): Promise<void> {
    const requestBody = Builder.buildRequest(config, context)
    Logger.warn('Prompt', String((requestBody as { input?: unknown }).input ?? ''))
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal
    })
    if (!response.ok) {
      throw new Error(`API responded ${response.status} ${response.statusText}`)
    }
    if (!response.body) {
      throw new Error('Response body is empty')
    }
    const parser = new Parser(callback, context.content.split('\n'))
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let streamBuffer = ''
    let rawModelText = ''
    try {
      for (;;) {
        if (signal.aborted) {
          break
        }
        const readResult = await reader.read()
        if (readResult.done) {
          break
        }
        streamBuffer += decoder.decode(readResult.value, { stream: true })
        const eventLines = streamBuffer.split('\n')
        streamBuffer = eventLines.pop() ?? ''
        for (const eventLine of eventLines) {
          if (!eventLine.startsWith('data: ') || eventLine === 'data: [DONE]') {
            continue
          }
          const sseEvent = JSON.parse(eventLine.slice(6)) as Types.StreamEvent
          if (sseEvent.type === 'response.output_text.delta' && sseEvent.delta) {
            rawModelText += sseEvent.delta
            parser.processChunk(sseEvent.delta)
          }
          if (signal.aborted) {
            break
          }
        }
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        void 0
      }
      Logger.warn('RawModel', rawModelText)
      parser.finalize()
    }
  }
}
