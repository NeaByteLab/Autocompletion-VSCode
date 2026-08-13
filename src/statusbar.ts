import * as Vscode from 'vscode'
import Config from '@app/config.ts'
import Logger from '@app/logger.ts'

export default class StatusBar {
  private static item: Vscode.StatusBarItem | null = null
  private static loading = false

  static dispose(): void {
    StatusBar.item?.dispose()
    StatusBar.item = null
  }

  static init(): void {
    if (!StatusBar.item) {
      StatusBar.item = Vscode.window.createStatusBarItem(
        Vscode.StatusBarAlignment.Right,
        100
      )
      StatusBar.item.command = `${Config.appId}.show`
    }
  }

  static async menu(): Promise<void> {
    const enabled = Config.isEnabled()
    const picked = await Vscode.window.showQuickPick(
      [
        {
          label: enabled ? '$(circle-slash) Disable' : '$(check) Enable',
          detail: enabled
            ? 'Turn off inline completion suggestions'
            : 'Turn on inline completion suggestions',
          action: 'toggle'
        },
        {
          label: '$(link) Set API URL',
          detail: 'Change the endpoint completions are requested from',
          action: 'setApiUrl'
        },
        {
          label: '$(symbol-parameter) Set Model',
          detail: 'Change the model name sent with each request',
          action: 'setApiModel'
        },
        {
          label: '$(key) Set API Key',
          detail: 'Store the API key used for completion requests',
          action: 'setApiKey'
        },
        {
          label: '$(trash) Clear API Key',
          detail: 'Remove the stored API key',
          action: 'clearApiKey'
        },
        {
          label: '$(gear) Open Settings',
          detail: 'Open the extension settings page',
          action: 'openSettings'
        },
        {
          label: '$(output) Show Logs',
          detail: 'Open the extension output channel',
          action: 'showLogs'
        }
      ],
      {
        title: StatusBar.label(),
        placeHolder: 'Select an action'
      }
    )
    if (!picked) {
      return
    }
    switch (picked.action) {
      case 'toggle':
        await Config.setEnabled(!enabled)
        StatusBar.refresh()
        break
      case 'setApiUrl':
        await Vscode.commands.executeCommand(`${Config.appId}.setApiUrl`)
        break
      case 'setApiModel':
        await Vscode.commands.executeCommand(`${Config.appId}.setApiModel`)
        break
      case 'setApiKey':
        await Vscode.commands.executeCommand(`${Config.appId}.setApiKey`)
        break
      case 'clearApiKey':
        await Vscode.commands.executeCommand(`${Config.appId}.clearApiKey`)
        break
      case 'openSettings':
        await Vscode.commands.executeCommand(`${Config.appId}.openSettings`)
        break
      case 'showLogs':
        Logger.show()
        break
      default:
        break
    }
  }

  static refresh(): void {
    if (!StatusBar.item) {
      return
    }
    const enabled = Config.isEnabled()
    let icon: string
    if (!enabled) {
      icon = 'circle-slash'
    } else if (StatusBar.loading) {
      icon = 'loading~spin'
    } else {
      icon = 'chip'
    }
    StatusBar.item.text = `$(${icon}) ${StatusBar.label()}`
    StatusBar.item.tooltip = enabled
      ? 'Autocompletion is enabled. Click for options.'
      : 'Autocompletion is disabled. Click for options.'
    StatusBar.item.show()
  }

  static setLoading(loading: boolean): void {
    StatusBar.loading = loading
    StatusBar.refresh()
  }

  private static label(): string {
    return Config.appId.charAt(0).toUpperCase() + Config.appId.slice(1)
  }
}
