import type * as Types from '@app/types.ts'

export default class Diff {
  private static BipolarArray = class<T> implements Types.BipolarArray<T> {
    private readonly capacity: number
    private readonly storage: T[]

    constructor(capacity: number, defaultValue: T) {
      this.capacity = capacity
      this.storage = new Array(capacity).fill(defaultValue)
    }

    copy(): Types.BipolarArray<T> {
      const defaultValue = this.storage[0]
      if (defaultValue === undefined) {
        throw new Error(
          'Cannot copy a BipolarArray when the default value is undefined because the first element must be defined before copying'
        )
      }
      const copiedArray = new Diff.BipolarArray<T>(this.capacity, defaultValue)
      for (let index = 0; index < this.capacity; index++) {
        const storedValue = this.storage[index]
        if (storedValue !== undefined) {
          copiedArray.storage[index] = storedValue
        }
      }
      return copiedArray
    }

    get(index: number): T {
      const resolvedIndex = index < 0 ? this.capacity + index : index
      const storedValue = this.storage[resolvedIndex]
      if (storedValue === undefined) {
        throw new Error(`Index ${index} is outside the valid range of this BipolarArray`)
      }
      return storedValue
    }

    set(index: number, value: T): void {
      const resolvedIndex = index < 0 ? this.capacity + index : index
      this.storage[resolvedIndex] = value
    }
  }

  static compute(oldText: string, newText: string): Types.DiffOutput {
    if (typeof oldText !== 'string') {
      throw new TypeError(`oldText must be a string but received ${typeof oldText}`)
    }
    if (typeof newText !== 'string') {
      throw new TypeError(`newText must be a string but received ${typeof newText}`)
    }
    return Diff.buildOutput(Diff.splitLines(oldText), Diff.splitLines(newText))
  }

  private static buildOutput(
    oldLines: readonly Types.DiffLine[],
    newLines: readonly Types.DiffLine[]
  ): Types.DiffOutput {
    if (oldLines.length === 0 && newLines.length === 0) {
      return { edits: [], editDistance: 0 }
    }
    const stateTrace = Diff.findShortest(oldLines, newLines)
    const diffEdits = Diff.findBacktrack(oldLines, newLines, stateTrace)
    return {
      edits: diffEdits,
      editDistance: stateTrace.length - 1
    }
  }

  private static findBacktrack(
    oldLines: readonly Types.DiffLine[],
    newLines: readonly Types.DiffLine[],
    stateTrace: Types.AlgorithmState[]
  ): Types.DiffEdit[] {
    let oldLineIndex = oldLines.length
    let newLineIndex = newLines.length
    const diffEdits: Types.DiffEdit[] = []
    for (let index = stateTrace.length - 1; index >= 0; index--) {
      const stateEntry = stateTrace[index]
      if (!stateEntry) {
        continue
      }
      const { diagonal: diagonalArray, depth } = stateEntry
      const diagonalIndex = oldLineIndex - newLineIndex
      let previousDiagonal: number
      if (
        diagonalIndex === -depth ||
        (diagonalIndex !== depth &&
          diagonalArray.get(diagonalIndex - 1) < diagonalArray.get(diagonalIndex + 1))
      ) {
        previousDiagonal = diagonalIndex + 1
      } else {
        previousDiagonal = diagonalIndex - 1
      }
      const previousOldIndex = diagonalArray.get(previousDiagonal)
      const previousNewIndex = previousOldIndex - previousDiagonal
      while (oldLineIndex > previousOldIndex && newLineIndex > previousNewIndex) {
        oldLineIndex -= 1
        newLineIndex -= 1
        diffEdits.push({
          type: 'equal',
          oldLine: oldLines[oldLineIndex],
          newLine: newLines[newLineIndex]
        })
      }
      if (depth > 0) {
        if (oldLineIndex === previousOldIndex) {
          diffEdits.push({
            type: 'insert',
            oldLine: undefined,
            newLine: newLines[previousNewIndex]
          })
        } else if (newLineIndex === previousNewIndex) {
          diffEdits.push({
            type: 'delete',
            oldLine: oldLines[previousOldIndex],
            newLine: undefined
          })
        }
        oldLineIndex = previousOldIndex
        newLineIndex = previousNewIndex
      }
    }
    return diffEdits.reverse()
  }

  private static findShortest(
    oldLines: readonly Types.DiffLine[],
    newLines: readonly Types.DiffLine[]
  ): Types.AlgorithmState[] {
    const oldLineCount = oldLines.length
    const newLineCount = newLines.length
    if (oldLineCount === 0 && newLineCount === 0) {
      return []
    }
    const maxEditDistance = oldLineCount + newLineCount
    const diagonalArray = new Diff.BipolarArray<number>(2 * maxEditDistance + 1, 0)
    const stateTrace: Types.AlgorithmState[] = []
    for (let depth = 0; depth <= maxEditDistance; depth++) {
      stateTrace.push({ diagonal: diagonalArray.copy(), depth })
      for (let diagonalIndex = -depth; diagonalIndex <= depth; diagonalIndex += 2) {
        let oldLineIndex: number
        if (
          diagonalIndex === -depth ||
          (diagonalIndex !== depth &&
            diagonalArray.get(diagonalIndex - 1) < diagonalArray.get(diagonalIndex + 1))
        ) {
          oldLineIndex = diagonalArray.get(diagonalIndex + 1)
        } else {
          oldLineIndex = diagonalArray.get(diagonalIndex - 1) + 1
        }
        let newLineIndex = oldLineIndex - diagonalIndex
        while (oldLineIndex < oldLineCount && newLineIndex < newLineCount) {
          const oldLine = oldLines[oldLineIndex]
          const newLine = newLines[newLineIndex]
          if (oldLine === undefined || newLine === undefined || oldLine.text !== newLine.text) {
            break
          }
          oldLineIndex += 1
          newLineIndex += 1
        }
        diagonalArray.set(diagonalIndex, oldLineIndex)
        if (oldLineIndex >= oldLineCount && newLineIndex >= newLineCount) {
          return stateTrace
        }
      }
    }
    throw new Error(
      'The diff algorithm could not find a valid edit path between the two inputs which should never happen with valid inputs'
    )
  }

  private static splitLines(inputText: string): Types.DiffLine[] {
    if (typeof inputText !== 'string') {
      throw new TypeError(`inputText must be a string but received ${typeof inputText}`)
    }
    if (inputText === '') {
      return []
    }
    return inputText.replaceAll(/\r\n?/g, '\n').split('\n').map((text, index) => ({
      number: index + 1,
      text
    }))
  }
}
