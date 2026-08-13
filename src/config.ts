import type * as Types from '@app/types.ts'
import * as Vscode from 'vscode'

export default class Config {
  static readonly appId = 'autocompletion'
  static readonly appSecret = `${Config.appId}.secret`
  static readonly publisher = 'neabyte'
  static readonly extensionId = 'autocompletion-vscode'
  private static appContext: Vscode.ExtensionContext | null = null

  static async clearKey(): Promise<void> {
    await Config.appContext?.secrets.delete(Config.appSecret)
  }

  static init(context: Vscode.ExtensionContext): void {
    Config.appContext = context
  }

  static isEnabled(): boolean {
    return Vscode.workspace.getConfiguration(Config.appId).get<boolean>(
      'enabled'
    ) ?? true
  }

  static async read(): Promise<Types.ApiConfig> {
    const settings = Vscode.workspace.getConfiguration(Config.appId)
    return {
      url: settings.get<string>('api.url') ?? '',
      model: settings.get<string>('api.model') ?? '',
      apiKey: (await Config.appContext?.secrets.get(Config.appSecret)) ?? ''
    }
  }

  static async setEnabled(enabled: boolean): Promise<void> {
    await Vscode.workspace.getConfiguration(Config.appId).update(
      'enabled',
      enabled,
      Vscode.ConfigurationTarget.Global
    )
  }

  static async setModel(model: string): Promise<void> {
    await Vscode.workspace.getConfiguration(Config.appId).update(
      'api.model',
      model,
      Vscode.ConfigurationTarget.Global
    )
  }

  static async setUrl(url: string): Promise<void> {
    await Vscode.workspace.getConfiguration(Config.appId).update(
      'api.url',
      url,
      Vscode.ConfigurationTarget.Global
    )
  }

  static async storeKey(apiKey: string): Promise<void> {
    await Config.appContext?.secrets.store(Config.appSecret, apiKey)
  }
}
