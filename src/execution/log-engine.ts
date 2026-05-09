import type { LogLevel } from '../types/index.ts';
import { Colors, color, bold, formatValue } from '../utils/colors.ts';

export interface LogEngineConfig {
  logLevel: LogLevel;
}

export interface LogEntry {
  level: string;
  text: string;
  nodeId?: string;
  timestamp: number;
}

export abstract class LogEngine {
  protected config: LogEngineConfig;

  constructor(config: LogEngineConfig) {
    this.config = config;
  }

  abstract log(entry: LogEntry): void;

  protected formatMessage(text: string): string {
    return text;
  }

  protected shouldLog(level: string): boolean {
    const levels: Record<string, number> = {
      silent: 0,
      minimal: 1,
      verbose: 2,
    };
    return levels[this.config.logLevel] >= levels[level];
  }
}

export class DefaultFormatter {
  format(entry: LogEntry): string {
    const prefix = this.getPrefixForLevel(entry.level);
    const time = new Date(entry.timestamp).toISOString().slice(11, 23);
    const label = entry.nodeId
      ? `${color(entry.nodeId, Colors.gray)} `
      : '';
    return `${color(time, Colors.dim)} ${prefix} ${label}${entry.text}`;
  }

  private getPrefixForLevel(level: string): string {
    switch (level) {
      case 'info':
        return color('ℹ', Colors.sky);
      case 'warn':
        return color('⚠', Colors.gold);
      case 'error':
        return color('✗', Colors.coral);
      case 'success':
        return color('✓', Colors.teal);
      case 'debug':
        return color('◆', Colors.gray);
      default:
        return color('·', Colors.silver);
    }
  }
}

export class ConsoleLogger {
  log(entry: LogEntry): void {
    const formatter = new DefaultFormatter();
    const formatted = formatter.format(entry);
    if (entry.level === 'error') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }
}

export class ExecutionLogger {
  private config: LogEngineConfig;
  private consoleLogger: ConsoleLogger;
  private formatter: DefaultFormatter;

  constructor(config: LogEngineConfig) {
    this.config = config;
    this.consoleLogger = new ConsoleLogger();
    this.formatter = new DefaultFormatter();
  }

  get logLevel(): LogLevel {
    return this.config.logLevel;
  }

  info(text: string, nodeId?: string): void {
    this.log({ level: 'info', text, nodeId, timestamp: Date.now() });
  }

  warn(text: string, nodeId?: string): void {
    this.log({ level: 'warn', text, nodeId, timestamp: Date.now() });
  }

  error(text: string, nodeId?: string): void {
    this.log({ level: 'error', text, nodeId, timestamp: Date.now() });
  }

  success(text: string, nodeId?: string): void {
    this.log({ level: 'success', text, nodeId, timestamp: Date.now() });
  }

  debug(text: string, nodeId?: string): void {
    this.log({ level: 'debug', text, nodeId, timestamp: Date.now() });
  }

  private log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;
    this.consoleLogger.log(entry);
  }

  private shouldLog(level: string): boolean {
    const levels: Record<string, number> = {
      silent: 0,
      minimal: 1,
      verbose: 2,
    };
    return levels[this.config.logLevel] >= levels[level];
  }

  // --- Streaming display ---

  private streamState: Map<
    string,
    { response: string; thinking?: string; done: boolean }
  > = new Map();
  private lastThinkingLength: Map<string, number> = new Map();
  private lastResponseLength: Map<string, number> = new Map();
  private streamStarted: Map<
    string,
    { thinking: boolean; response: boolean }
  > = new Map();

  handleStreamChunk(chunk: {
    nodeId: string;
    state: { response: string; thinking?: string; done: boolean };
  }): void {
    const { nodeId } = chunk;
    const { thinking, response, done } = chunk.state;

    this.streamState.set(chunk.nodeId, chunk.state);

    if (!this.streamStarted.has(nodeId)) {
      this.streamStarted.set(nodeId, { thinking: false, response: false });
    }
    const started = this.streamStarted.get(nodeId)!;

    const prevThinkingLen = this.lastThinkingLength.get(nodeId) || 0;
    const prevResponseLen = this.lastResponseLength.get(nodeId) || 0;

    if (this.config.logLevel === 'verbose' && thinking) {
      const newThinking = thinking.slice(prevThinkingLen);
      if (newThinking.length > 0) {
        if (!started.thinking) {
          Deno.stdout.writeSync(
            new TextEncoder().encode(
              `\n  ${color('thinking', Colors.italic + Colors.gray)} ${color(Colors.line.repeat(30), Colors.dim)}\n  `,
            ),
          );
          started.thinking = true;
        }
        Deno.stdout.writeSync(
          new TextEncoder().encode(color(newThinking, Colors.gray)),
        );
        this.lastThinkingLength.set(nodeId, thinking.length);
      }
    }

    const newResponse = response.slice(prevResponseLen);
    if (newResponse.length > 0) {
      if (!started.response) {
        if (this.config.logLevel === 'verbose') {
          const lineLen = Math.max(5, 40 - 'response'.length);
          Deno.stdout.writeSync(
            new TextEncoder().encode(
              `\n  ${color('response', Colors.italic + Colors.teal)} ${color(Colors.line.repeat(lineLen), Colors.dim)}\n  `,
            ),
          );
        } else {
          Deno.stdout.writeSync(new TextEncoder().encode(`  `));
        }
        started.response = true;
      }
      Deno.stdout.writeSync(
        new TextEncoder().encode(color(newResponse, Colors.teal)),
      );
      this.lastResponseLength.set(nodeId, response.length);
    }

    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\n`));
    }
  }

  printStreamSummary(nodeId: string): void {
    const info = this.streamState.get(nodeId);
    if (!info) return;
    const parts: string[] = [];
    if (info.thinking) {
      parts.push(
        `${color('thinking', Colors.gray)} ${color(String(info.thinking.length), Colors.silver)}`,
      );
    }
    parts.push(
      `${color('response', Colors.teal)} ${color(String(info.response.length), Colors.silver)}`,
    );
    console.log(
      `  ${color(Colors.dot, Colors.silver)} ${color('stream:', Colors.dim)} ${parts.join(color('  ', Colors.dim))} ${color('chars', Colors.dim)}`,
    );
  }

  // --- Header/Footer ---

  printHeader(
    mode: string,
    nodeCount: number,
    extras: Record<string, string> = {},
  ): void {
    if (this.config.logLevel === 'silent') return;
    console.log(`\n${color(Colors.line.repeat(50), Colors.gray)}`);
    console.log(
      `${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color(mode, Colors.sky))}${color(` ${nodeCount} nodes`, Colors.dim)}`,
    );

    if (this.config.logLevel === 'verbose') {
      console.log(color(Colors.line.repeat(50), Colors.dim));
      for (const [key, val] of Object.entries(extras)) {
        console.log(
          `  ${color(Colors.dot, Colors.gray)} ${color(key + ':', Colors.dim)} ${color(val, Colors.sky)}`,
        );
      }
    }
    console.log(color(Colors.line.repeat(50), Colors.dim) + '\n');
  }

  printFooter(status: 'success' | 'failed' | 'cancelled', extras: string[] = []): void {
    if (this.config.logLevel === 'silent') return;
    const bg =
      status === 'success'
        ? Colors.bgTeal
        : status === 'failed'
        ? Colors.bgRose
        : Colors.bgGray;
    console.log(color(Colors.line.repeat(50), Colors.dim));
    console.log(
      `${color(` ${status.toUpperCase()} `, Colors.bold + bg + Colors.white)} ${color(extras.join(', '), Colors.dim)}`,
    );
  }

  // --- Node progress ---

  printNodeStart(nodeId: string, nodeType: string, index: number, total: number): void {
    if (this.config.logLevel === 'silent') return;
    const progress = color(`[${index}/${total}]`, Colors.dim);
    const nodeIdText = bold(color(nodeId, Colors.sky));
    const typeText = color(`(${nodeType})`, Colors.gray);
    console.log(
      `${color(Colors.arrow, Colors.sky)} ${progress} ${nodeIdText} ${typeText}`,
    );
  }

  printNodeInputs(inputs: Record<string, unknown>): void {
    if (this.config.logLevel !== 'verbose') return;
    for (const [k, v] of Object.entries(inputs)) {
      const preview = formatValue(v);
      console.log(
        `    ${color(Colors.bullet, Colors.sky)} ${color(k, Colors.gray)} ${color('=', Colors.dim)} ${color(preview, Colors.silver)}`,
      );
    }
  }

  printNodeDone(durationMs: number): void {
    if (this.config.logLevel === 'silent') return;
    const time = color(`${durationMs.toFixed(1)}ms`, Colors.gold);
    console.log(
      `  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}`,
    );
  }

  printNodeError(error: unknown): void {
    if (this.config.logLevel === 'silent') return;
    console.log(
      `  ${color(Colors.cross, Colors.coral)} ${bold(color('FAILED', Colors.coral))}: ${color(String(error), Colors.silver)}`,
    );
  }
}
