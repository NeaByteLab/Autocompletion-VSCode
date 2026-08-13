import * as Vscode from 'vscode'

export default class Logger {
  private static channel: Vscode.OutputChannel | null = null

  static debug(message: string, ...args: unknown[]): void {
    Logger.write('DEBUG', message, args)
  }

  static dispose(): void {
    Logger.channel?.dispose()
    Logger.channel = null
  }

  static error(message: string, ...args: unknown[]): void {
    Logger.write('ERROR', message, args)
  }

  static init(name = 'Autocompletion'): void {
    if (!Logger.channel) {
      Logger.channel = Vscode.window.createOutputChannel(name)
    }
  }

  static show(): void {
    Logger.channel?.show(true)
  }

  static warn(message: string, ...args: unknown[]): void {
    Logger.write('WARN', message, args)
  }

  private static format(value: unknown): string {
    if (value instanceof Error) {
      return value.stack ?? `${value.name}: ${value.message}`
    }
    if (typeof value === 'string') {
      return value
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  private static write(level: string, message: string, args: unknown[]): void {
    if (!Logger.channel) {
      return
    }
    const timestamp = new Date().toISOString()
    const extras = args.length > 0 ? ` ${args.map(Logger.format).join(' ')}` : ''
    Logger.channel.appendLine(`[${timestamp}] [${level}] ${message}${extras}`)
  }
}
