import type * as Vscode from 'vscode'

declare module 'vscode' {
  export interface InlineCompletionItem {
    isInlineEdit?: boolean
    showRange?: Vscode.Range
    jumpToPosition?: Vscode.Position
    showInlineEditMenu?: boolean
    displayLocation?: InlineCompletionDisplayLocation
  }

  export enum InlineCompletionDisplayLocationKind {
    Code = 1,
    Label = 2
  }

  export interface InlineCompletionDisplayLocation {
    range: Vscode.Range
    kind: InlineCompletionDisplayLocationKind
    label: string
  }

  export interface InlineCompletionItemProviderMetadata {
    yieldTo?: string[]
    groupId?: string
    debounceDelayMs?: number
    displayName?: string
    excludes?: string[]
  }

  export enum InlineCompletionEndOfLifeReasonKind {
    Accepted = 0,
    Rejected = 1,
    Ignored = 2
  }

  export type InlineCompletionEndOfLifeReason =
    | { kind: InlineCompletionEndOfLifeReasonKind.Accepted }
    | { kind: InlineCompletionEndOfLifeReasonKind.Rejected }
    | {
      kind: InlineCompletionEndOfLifeReasonKind.Ignored
      supersededBy?: Vscode.InlineCompletionItem
      userTypingDisagreed: boolean
    }

  export interface InlineCompletionItemProvider {
    onDidChange?: Vscode.Event<void>
    handleEndOfLifetime?(
      completionItem: Vscode.InlineCompletionItem,
      reason: InlineCompletionEndOfLifeReason
    ): void
  }

  export namespace languages {
    export function registerInlineCompletionItemProvider(
      selector: Vscode.DocumentSelector,
      provider: Vscode.InlineCompletionItemProvider,
      metadata: InlineCompletionItemProviderMetadata
    ): Vscode.Disposable
  }
}
