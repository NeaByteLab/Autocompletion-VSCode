import type * as Types from '@app/types.ts'

export default class Parser {
  private static readonly hunkHeader = /^@@\s+(?:(.+):)?(\d+)$/
  private static readonly lineMatchers: Types.LineMatcher[] = [
    (source, target) => source === target,
    (source, target) => source.trim() === target.trim(),
    (source, target) => {
      const sourceTrimmed = source.trim()
      const targetTrimmed = target.trim()
      if (sourceTrimmed === '' || targetTrimmed === '') {
        return false
      }
      return sourceTrimmed.startsWith(targetTrimmed) || targetTrimmed.startsWith(sourceTrimmed)
    }
  ]
  private readonly onDiff: Types.OperationCallback
  private currentHunk: Types.HunkState | null = null
  private fileContent: string[] | null
  private streamBuffer = ''

  constructor(onDiff: Types.OperationCallback, fileContent?: string[]) {
    this.onDiff = onDiff
    this.fileContent = fileContent ? Array.from(fileContent) : null
  }

  finalize(): void {
    if (Parser.hasContent(this.streamBuffer)) {
      this.streamBuffer += '\n'
      this.parseBuffer()
    }
    this.completeCurrentHunk()
    this.currentHunk = null
  }

  processChunk(chunk: string): void {
    this.streamBuffer += chunk
    this.parseBuffer()
  }

  private completeCurrentHunk(): void {
    if (
      this.currentHunk?.path === undefined ||
      this.currentHunk.lineNumber === undefined ||
      this.currentHunk.content === undefined ||
      (this.currentHunk.content.removed.length === 0 && this.currentHunk.content.added.length === 0)
    ) {
      this.currentHunk = null
      return
    }
    const parsedHunk: Types.DiffHunk = {
      path: this.currentHunk.path,
      lineNumber: this.currentHunk.lineNumber,
      content: this.currentHunk.content
    }
    this.currentHunk = null
    if (this.fileContent === null) {
      this.onDiff(parsedHunk)
      return
    }
    if (parsedHunk.content.removed.length > 0) {
      parsedHunk.lineNumber = this.resolveLine(parsedHunk)
    }
    this.stripOverlap(parsedHunk)
    if (parsedHunk.content.removed.length > 0 || parsedHunk.content.added.length > 0) {
      this.onDiff(parsedHunk)
    }
  }

  private static hasContent(line: string): boolean {
    return line.trim().length > 0
  }

  private parseBuffer(): void {
    const parsedLines = this.streamBuffer.split('\n')
    this.streamBuffer = this.streamBuffer.endsWith('\n') ? '' : (parsedLines.pop() ?? '')
    for (const line of parsedLines) {
      this.processLine(line)
    }
  }

  private processLine(rawLine: string): void {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const headerMatch = Parser.hunkHeader.exec(line)
    if (headerMatch) {
      this.completeCurrentHunk()
      this.currentHunk = {
        path: headerMatch[1] ?? '',
        lineNumber: parseInt(headerMatch[2] ?? '0', 10),
        content: { added: [], removed: [], raw: `${line}\n` }
      }
      return
    }
    if (!this.currentHunk?.content) {
      return
    }
    if (line.startsWith('-|')) {
      this.currentHunk.content.raw += `${line}\n`
      this.currentHunk.content.removed.push(line.slice(2))
    } else if (line.startsWith('+|')) {
      this.currentHunk.content.raw += `${line}\n`
      this.currentHunk.content.added.push(line.slice(2))
    } else if (line.startsWith('-') || line.startsWith('+')) {
      this.currentHunk.content.raw += `${line}\n`
      const target = line.startsWith('-')
        ? this.currentHunk.content.removed
        : this.currentHunk.content.added
      target.push(line.slice(1))
    }
  }

  private resolveLine(targetHunk: Types.DiffHunk): number {
    const fileLines = this.fileContent!
    const hintIndex = targetHunk.lineNumber - 1
    for (const matchFn of Parser.lineMatchers) {
      for (let searchDistance = 0; searchDistance <= fileLines.length; searchDistance++) {
        const candidates = searchDistance === 0
          ? [hintIndex]
          : [hintIndex + searchDistance, hintIndex - searchDistance]
        for (const candidateIndex of candidates) {
          if (
            candidateIndex < 0 ||
            candidateIndex + targetHunk.content.removed.length > fileLines.length
          ) {
            continue
          }
          if (
            targetHunk.content.removed.every((removedLine, lineOffset) =>
              matchFn(fileLines[candidateIndex + lineOffset]!, removedLine)
            )
          ) {
            return candidateIndex + 1
          }
        }
      }
    }
    return targetHunk.lineNumber
  }

  private stripOverlap(targetHunk: Types.DiffHunk): void {
    if (targetHunk.content.added.length === 0) {
      return
    }
    const afterStartIndex = targetHunk.lineNumber - 1 + targetHunk.content.removed.length
    const existingLines = this.fileContent!.slice(afterStartIndex, afterStartIndex + 100).filter(
      Parser.hasContent
    )
    const insertedLines = targetHunk.content.added.filter(Parser.hasContent)
    if (insertedLines.length === 0 || existingLines.length === 0) {
      return
    }
    const duplicateLines = new Set<string>()
    for (let addOffset = 0; addOffset < insertedLines.length; addOffset++) {
      for (let afterOffset = 0; afterOffset < existingLines.length; afterOffset++) {
        let matchLength = 0
        while (
          addOffset + matchLength < insertedLines.length &&
          afterOffset + matchLength < existingLines.length &&
          insertedLines[addOffset + matchLength]!.trim() ===
            existingLines[afterOffset + matchLength]!.trim()
        ) {
          matchLength++
        }
        if (matchLength >= 2) {
          for (let matchOffset = 0; matchOffset < matchLength; matchOffset++) {
            duplicateLines.add(insertedLines[addOffset + matchOffset]!.trim())
          }
        }
      }
    }
    if (duplicateLines.size === 0) {
      return
    }
    for (let lineIndex = targetHunk.content.added.length - 1; lineIndex >= 0; lineIndex--) {
      if (duplicateLines.has(targetHunk.content.added[lineIndex]!.trim())) {
        duplicateLines.delete(targetHunk.content.added[lineIndex]!.trim())
        targetHunk.content.added.splice(lineIndex, 1)
      }
    }
  }
}
