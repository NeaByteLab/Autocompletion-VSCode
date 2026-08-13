import '@app/vscode.d.ts'
import type * as Types from '@app/types.ts'
import * as Vscode from 'vscode'
import Config from '@app/config.ts'
import Context from '@app/context.ts'
import Helper from '@app/helper.ts'
import Logger from '@app/logger.ts'
import Session from '@app/session.ts'
import StatusBar from '@app/statusbar.ts'
import NES from '@app/nes/index.ts'

let acceptedEdit: Types.InlineEdit | null = null
let appliedInlineEdit = false
const session = new Session()
const docSnapshots = new Map<string, string>()

export function activate(context: Types.ExtensionContext): void {
  Logger.init()
  Config.init(context)
  StatusBar.init()
  StatusBar.refresh()
  const changeEmitter = new Vscode.EventEmitter<void>()
  context.subscriptions.push(
    changeEmitter,
    Vscode.commands.registerCommand(`${Config.appId}.show`, async () => {
      await StatusBar.menu()
    }),
    Vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(Config.appId)) {
        StatusBar.refresh()
      }
    }),
    Vscode.commands.registerCommand(`${Config.appId}.setApiKey`, async () => {
      const apiKey = await Vscode.window.showInputBox({
        prompt: 'Enter your API key',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'API key'
      })
      if (apiKey) {
        await Config.storeKey(apiKey)
      }
    }),
    Vscode.commands.registerCommand(`${Config.appId}.setApiUrl`, async () => {
      const current = await Config.read()
      const url = await Vscode.window.showInputBox({
        prompt: 'Enter the API endpoint URL',
        ignoreFocusOut: true,
        value: current.url,
        placeHolder: 'https://host/v1/responses',
        validateInput: (value) =>
          value.trim().startsWith('http') ? null : 'URL must start with http'
      })
      if (url) {
        await Config.setUrl(url.trim())
      }
    }),
    Vscode.commands.registerCommand(`${Config.appId}.setApiModel`, async () => {
      const current = await Config.read()
      const model = await Vscode.window.showInputBox({
        prompt: 'Enter the model name',
        ignoreFocusOut: true,
        value: current.model,
        placeHolder: 'deepseek-v4-flash'
      })
      if (model) {
        await Config.setModel(model.trim())
      }
    }),
    Vscode.commands.registerCommand(`${Config.appId}.openSettings`, async () => {
      await Vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${Config.publisher}.${Config.extensionId}`
      )
    }),
    Vscode.commands.registerCommand(`${Config.appId}.clearApiKey`, async () => {
      await Config.clearKey()
    }),
    Vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.scheme !== 'file') {
        return
      }
      if (
        event.reason === Vscode.TextDocumentChangeReason.Undo ||
        event.reason === Vscode.TextDocumentChangeReason.Redo
      ) {
        acceptedEdit = null
        session.reset()
        docSnapshots.set(event.document.uri.fsPath, event.document.getText())
        changeEmitter.fire()
        return
      }
      if (acceptedEdit && Helper.isAccept(event, acceptedEdit)) {
        const wasInlineEdit = appliedInlineEdit
        session.accept(acceptedEdit)
        session.commit(acceptedEdit)
        session.reanchor(event.contentChanges ?? [])
        session.prune(event.document.getText())
        acceptedEdit = null
        appliedInlineEdit = false
        docSnapshots.set(event.document.uri.fsPath, event.document.getText())
        changeEmitter.fire()
        if (!wasInlineEdit) {
          void Vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
        }
        return
      }
      acceptedEdit = null
      const previous = docSnapshots.get(event.document.uri.fsPath)
      const current = event.document.getText()
      if (previous !== undefined && previous !== current) {
        for (const userEdit of Helper.deriveEdits(previous, current)) {
          session.commit(userEdit)
        }
      }
      docSnapshots.set(event.document.uri.fsPath, current)
      session.reanchor(event.contentChanges ?? [])
      session.prune(current)
      changeEmitter.fire()
    }),
    Vscode.window.onDidChangeTextEditorSelection(() => {
      if (session.getPending().length > 0) {
        changeEmitter.fire()
      }
    }),
    Vscode.languages.registerInlineCompletionItemProvider(
      '*',
      {
        onDidChange: changeEmitter.event,
        handleEndOfLifetime(item, reason) {
          const edit = Helper.itemEdits.get(item)
          if (!edit) {
            return
          }
          if (reason.kind === Vscode.InlineCompletionEndOfLifeReasonKind.Accepted) {
            const cursor = Vscode.window.activeTextEditor?.selection.active
            const landed = cursor !== undefined &&
              cursor.line >= edit.old.range.start.line &&
              cursor.line <= edit.old.range.end.line
            if (item.isInlineEdit && !landed) {
              return
            }
            session.accept(edit)
            session.commit(edit)
            acceptedEdit = edit
            appliedInlineEdit = Boolean(item.isInlineEdit)
            if (item.isInlineEdit) {
              void applyInlineEdit(item)
            }
          } else if (reason.kind === Vscode.InlineCompletionEndOfLifeReasonKind.Rejected) {
            session.reject(edit)
          } else if (reason.kind === Vscode.InlineCompletionEndOfLifeReasonKind.Ignored) {
            if (reason.userTypingDisagreed) {
              session.reject(edit)
            }
          }
        },
        async provideInlineCompletionItems(document, position, completionContext, token) {
          if (!Config.isEnabled()) {
            return []
          }
          if (document.uri.scheme !== 'file') {
            return []
          }
          const content = document.getText()
          if (!docSnapshots.has(document.uri.fsPath)) {
            docSnapshots.set(document.uri.fsPath, content)
          }
          const config = await Config.read()
          if (token.isCancellationRequested) {
            return []
          }
          if (!config.url || !config.model) {
            return []
          }
          session.prune(content)
          const shouldFetch = session.getPending().length === 0
          if (shouldFetch) {
            const problem = Context.formatDiagnostics(
              Vscode.languages.getDiagnostics(document.uri),
              position.line
            )
            const suggestionHistory = Context.formatEdits(session.getHistory())
            const declinedEdits = Context.formatEdits(session.getDeclined())
            const editContext: Types.EditContext = {
              path: document.uri.fsPath,
              language: document.languageId,
              content,
              line: position.line
            }
            if (problem) {
              editContext.problem = problem
            }
            if (suggestionHistory) {
              editContext.history = suggestionHistory
            }
            if (declinedEdits) {
              editContext.declined = declinedEdits
            }
            StatusBar.setLoading(true)
            try {
              await collectEdits(config, editContext, content, token, changeEmitter)
            } finally {
              StatusBar.setLoading(false)
            }
          }
          if (token.isCancellationRequested) {
            return []
          }
          const ordered = session.ordered(position.line)
          if (ordered.length === 0) {
            return []
          }
          const invoked =
            completionContext.triggerKind === Vscode.InlineCompletionTriggerKind.Invoke
          const selected = invoked ? ordered : ordered.slice(0, 1)
          const items = selected.map((edit) => Helper.toItem(edit, position))
          return { items, enableForwardStability: true }
        }
      },
      { debounceDelayMs: 0, displayName: 'Autocompletion', groupId: Config.appId }
    )
  )
}

export function deactivate(): void {
  Logger.dispose()
  StatusBar.dispose()
}

async function applyInlineEdit(item: Types.InlineCompletionItem): Promise<void> {
  const edit = Helper.itemEdits.get(item)
  if (!edit) {
    return
  }
  const editor = Vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  if (edit.old.text === '') {
    return
  }
  const range = Helper.toRange(edit.old.range)
  if (editor.document.getText(range) !== edit.old.text) {
    return
  }
  const applied = await editor.edit(
    (builder) => {
      builder.replace(range, edit.new.text)
    },
    { undoStopBefore: true, undoStopAfter: false }
  )
  if (!applied) {
    return
  }
  const writtenLines = edit.new.text.split('\n')
  const lastLine = writtenLines[writtenLines.length - 1] ?? ''
  const endLine = edit.old.range.start.line + writtenLines.length - 1
  const endCharacter = writtenLines.length === 1
    ? edit.old.range.start.character + lastLine.length
    : lastLine.length
  const caret = new Vscode.Position(endLine, endCharacter)
  editor.selection = new Vscode.Selection(caret, caret)
  await Vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
}

async function collectEdits(
  config: Types.ApiConfig,
  context: Types.EditContext,
  content: string,
  token: Types.CancellationToken,
  changeEmitter: Types.EventEmitter<void>
): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }
    Logger.debug('Context', {
      path: context.path,
      language: context.language,
      line: context.line,
      lines: context.content.split('\n').length,
      hasProblem: Boolean(context.problem),
      hasHistory: Boolean(context.history),
      hasDeclined: Boolean(context.declined)
    })
    const handle = NES.run(config, context, (diff) => {
      let edits: Types.InlineEdit[]
      try {
        edits = NES.calculate(diff, content)
      } catch (error) {
        Logger.warn('Skipped', error)
        return
      }
      Logger.debug('Data', edits)
      const cancelled = token.isCancellationRequested
      let pushedAfterCancel = false
      for (const edit of edits) {
        const added = session.push(edit)
        if (cancelled) {
          pushedAfterCancel = pushedAfterCancel || added
          continue
        }
        if (added || edit.old.range.start.line === context.line) {
          finish()
        }
        if (settled && added) {
          changeEmitter.fire()
        }
      }
      if (pushedAfterCancel) {
        changeEmitter.fire()
      }
      if (session.isFull()) {
        handle.abort()
        finish()
      }
    })
    token.onCancellationRequested(() => {
      handle.abort()
      finish()
    })
    handle.done.then(finish)
  })
}
