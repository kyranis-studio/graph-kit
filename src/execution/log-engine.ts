import type { LogLevel } from "../types/index.ts";
import { Colors, color, bold, applyBg, formatValue } from "../utils/colors.ts";

/**
 * Configuration for the Log Engine
 */
export interface LogEngineConfig {
  logLevel: LogLevel;
  timestamp?: boolean;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: string;
  text: string;
  nodeId?: string;
  timestamp: number;
}

/**
 * Abstract base class for log engines
 */
export abstract class LogEngine {
  protected config: LogEngineConfig;

  constructor(config: LogEngineConfig) {
    this.config = config;
  }

  abstract log(entry: LogEntry): void;

  protected shouldLog(level: string): boolean {
    const levels: Record<string, number> = {
      silent: 0,
      muted: 0,
      minimal: 1,
      verbose: 2,
    };
    const currentLevel = levels[this.config.logLevel] ?? 1;
    const targetLevel = levels[level] ?? 0;
    return currentLevel >= targetLevel;
  }
}

/**
 * Default formatter for log entries
 */
export class DefaultFormatter {
  format(entry: LogEntry): string {
    const time = new Date(entry.timestamp).toISOString().slice(11, 23);
    const prefix = this.getPrefixForLevel(entry.level);
    const label = entry.nodeId
      ? ` ${color(entry.nodeId, Colors.textMuted)}`
      : "";
    return `${color(time, Colors.textSecondary)} ${prefix}${label} ${entry.text}`;
  }

  private getPrefixForLevel(level: string): string {
    switch (level) {
      case "info":
        return color("ℹ", Colors.info);
      case "warn":
        return color("⚠", Colors.warning);
      case "error":
        return color("✗", Colors.error);
      case "success":
        return color("✓", Colors.success);
      case "debug":
        return color("◆", Colors.textMuted);
      default:
        return color("·", Colors.textSecondary);
    }
  }
}

/**
 * Console implementation of a logger
 */
export class ConsoleLogger {
  log(entry: LogEntry): void {
    const formatter = new DefaultFormatter();
    const formatted = formatter.format(entry);
    if (entry.level === "error") {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }
}

/**
 * Main execution logger that implements the modern dark grayscale look
 */
export class ExecutionLogger {
  private config: LogEngineConfig;
  private consoleLogger: ConsoleLogger;

  // Streaming state management
  private streamState: Map<
    string,
    { response: string; thinking?: string; done: boolean }
  > = new Map();
  private lastThinkingLength: Map<string, number> = new Map();
  private lastResponseLength: Map<string, number> = new Map();
  private streamStarted: Map<string, { thinking: boolean; response: boolean }> =
    new Map();

  constructor(config: LogEngineConfig) {
    this.config = config;
    this.consoleLogger = new ConsoleLogger();
  }

  get logLevel(): LogLevel {
    return this.config.logLevel;
  }

  private shouldLog(level: string): boolean {
    const levels: Record<string, number> = {
      silent: 0,
      muted: 0,
      minimal: 1,
      verbose: 2,
    };
    const current = levels[this.config.logLevel] ?? 1;
    const target = levels[level] ?? 0;
    return current >= target;
  }

  private getWidth(): number {
    try {
      return Deno.consoleSize().columns;
    } catch {
      return 80;
    }
  }

  private pad(text: string, bg: string): string {
    const width = this.getWidth();
    // Strip ANSI codes for length calculation
    const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = Math.max(0, width - stripped.length);
    return `${bg}${text}${" ".repeat(padding)}${Colors.reset}`;
  }

  // --- Level 1: Graph boundaries (bgElevated) ---

  printHeader(
    mode: string,
    nodeCount: number,
    extras: Record<string, string> = {},
  ): void {
    if (!this.shouldLog("minimal")) return;

    console.log();
    const title = ` GRAPH EXECUTION START `;
    console.log(
      this.pad(color(bold(title), Colors.textPrimary), Colors.bgElevated),
    );

    if (this.shouldLog("verbose")) {
      const details = [
        `mode: ${color(mode, Colors.accent)}`,
        `nodes: ${color(String(nodeCount), Colors.accent)}`,
        ...Object.entries(extras).map(
          ([k, v]) => `${k}: ${color(v, Colors.accent)}`,
        ),
      ];
      for (const detail of details) {
        console.log(
          this.pad(
            `  ${color(Colors.dot, Colors.textMuted)} ${detail}`,
            Colors.bgElevated,
          ),
        );
      }
    }
    console.log();
  }

  printFooter(
    status: "success" | "failed" | "cancelled",
    extras: string[] = [],
  ): void {
    if (!this.shouldLog("minimal")) return;

    const statusColor =
      status === "success"
        ? Colors.success
        : status === "failed"
          ? Colors.error
          : Colors.warning;
    const statusIcon =
      status === "success"
        ? Colors.check
        : status === "failed"
          ? Colors.cross
          : Colors.warn;
    const statusText =
      status === "success"
        ? "Graph completed successfully"
        : status === "failed"
          ? "Graph failed"
          : "Graph cancelled";

    console.log();
    const line = ` ${color(statusIcon, statusColor)} ${color(bold(statusText.toUpperCase()), Colors.textPrimary)}`;
    console.log(this.pad(line, Colors.bgElevated));

    if (extras.length > 0) {
      console.log(
        this.pad(
          `   ${color(extras.join(", "), Colors.textSecondary)}`,
          Colors.bgElevated,
        ),
      );
    }
    console.log();
  }

  // --- Level 2: Node execution blocks (bgSurface) ---

  printNodeStart(
    nodeId: string,
    nodeType: string,
    index: number,
    total: number,
    label?: string,
  ): void {
    if (!this.shouldLog("minimal")) return;

    const progress = color(`[${index}/${total}]`, Colors.textSecondary);
    const icon = color(Colors.bullet, Colors.accent);
    const idText = bold(color(nodeId, Colors.accent));
    const typeText = color(`(${nodeType})`, Colors.textSecondary);
    const labelText = label ? ` ${color(label, Colors.textMuted)}` : "";

    console.log(
      this.pad(
        ` ${icon} ${progress} ${idText} ${typeText}${labelText}`,
        Colors.bgSurface,
      ),
    );

    if (this.config.timestamp !== false) {
      const time = new Date().toLocaleTimeString();
      console.log(
        this.pad(
          `  ${color(Colors.arrow, Colors.textSecondary)} started at ${color(time, Colors.textSecondary)}`,
          Colors.bgSurface,
        ),
      );
    }
  }

  printNodeInputs(inputs: Record<string, unknown>): void {
    if (!this.shouldLog("verbose")) return;

    console.log(
      this.pad(
        `  ${color(Colors.arrow, Colors.textPrimary)} inputs:`,
        Colors.bgSurface,
      ),
    );
    for (const [k, v] of Object.entries(inputs)) {
      const preview = formatValue(v);
      console.log(
        this.pad(
          `    ${color(Colors.dot, Colors.accent)} ${color(k, Colors.textSecondary)} ${color("=", Colors.textMuted)} ${color(preview, Colors.textPrimary)}`,
          Colors.bgSurface,
        ),
      );
    }
  }

  printNodeOutputs(outputs: Record<string, unknown>): void {
    if (!this.shouldLog("verbose")) return;

    console.log(
      this.pad(
        `  ${color(Colors.arrow, Colors.textPrimary)} outputs:`,
        Colors.bgSurface,
      ),
    );
    for (const [k, v] of Object.entries(outputs)) {
      const preview = formatValue(v);
      console.log(
        this.pad(
          `    ${color(Colors.dot, Colors.accent)} ${color(k, Colors.textSecondary)} ${color("=", Colors.textMuted)} ${color(preview, Colors.textPrimary)}`,
          Colors.bgSurface,
        ),
      );
    }
  }

  printNodeDone(durationMs: number): void {
    if (!this.shouldLog("minimal")) return;

    const durationStr =
      durationMs >= 1000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${durationMs.toFixed(1)}ms`;

    console.log(
      this.pad(
        `  ${color(Colors.check, Colors.success)} ${color("completed", Colors.success)} in ${color(durationStr, Colors.warning)}`,
        Colors.bgSurface,
      ),
    );
    console.log(); // Spacing after node block
  }

  printNodeError(error: unknown): void {
    if (!this.shouldLog("minimal")) return;

    console.log(
      this.pad(
        `  ${color(Colors.cross, Colors.error)} ${bold(color("FAILED", Colors.error))}: ${color(String(error), Colors.textSecondary)}`,
        Colors.bgSurface,
      ),
    );
    console.log();
  }

  // --- Level 4: Streaming content (bgAccentTint) ---

  handleStreamChunk(chunk: {
    nodeId: string;
    state: { response: string; thinking?: string; done: boolean };
    streaming?: boolean;
  }): void {
    const isVerbose = this.shouldLog("verbose");
    const isMinimalWithStreaming = this.shouldLog("minimal") && chunk.streaming;

    if (!isVerbose && !isMinimalWithStreaming) return;

    const { nodeId } = chunk;
    const { thinking, response, done } = chunk.state;

    this.streamState.set(nodeId, chunk.state);

    if (!this.streamStarted.has(nodeId)) {
      this.streamStarted.set(nodeId, { thinking: false, response: false });
    }
    const started = this.streamStarted.get(nodeId)!;

    const prevThinkingLen = this.lastThinkingLength.get(nodeId) || 0;
    const prevResponseLen = this.lastResponseLength.get(nodeId) || 0;

    if (thinking) {
      const newThinking = thinking.slice(prevThinkingLen);
      if (newThinking.length > 0) {
        if (!started.thinking) {
          const label = `  ${color(Colors.arrow, Colors.accentHighlight)} ${color("thinking:", Colors.accentHighlight)} `;
          Deno.stdout.writeSync(
            new TextEncoder().encode(Colors.bgAccentTint + label),
          );
          started.thinking = true;
        }
        Deno.stdout.writeSync(
          new TextEncoder().encode(color(newThinking, Colors.textMuted)),
        );
        this.lastThinkingLength.set(nodeId, thinking.length);
      }
    }

    const newResponse = response.slice(prevResponseLen);
    if (newResponse.length > 0) {
      if (!started.response) {
        if (started.thinking) {
          Deno.stdout.writeSync(new TextEncoder().encode("\n"));
        }
        const label = `  ${color(Colors.arrow, Colors.success)} ${color("response:", Colors.success)} `;
        Deno.stdout.writeSync(
          new TextEncoder().encode(Colors.bgAccentTint + label),
        );
        started.response = true;
      }
      Deno.stdout.writeSync(
        new TextEncoder().encode(color(newResponse, Colors.textPrimary)),
      );
      this.lastResponseLength.set(nodeId, response.length);
    }

    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(Colors.reset + "\n"));
    }
  }

  printStreamSummary(nodeId: string): void {
    if (!this.shouldLog("verbose")) return;

    const info = this.streamState.get(nodeId);
    if (!info) return;

    const parts: string[] = [];
    if (info.thinking) {
      parts.push(
        `${color("thinking:", Colors.textMuted)} ${color(String(info.thinking.length), Colors.textSecondary)}`,
      );
    }
    parts.push(
      `${color("response:", Colors.textMuted)} ${color(String(info.response.length), Colors.textSecondary)}`,
    );

    console.log(
      this.pad(
        `  ${color(Colors.dot, Colors.textMuted)} ${color("stream", Colors.textMuted)} ${parts.join(color(" | ", Colors.textMuted))} ${color("chars", Colors.textMuted)}`,
        Colors.bgSurface,
      ),
    );
  }

  // --- Level 5: Debug metadata (bgGray) ---

  printDebug(key: string, value: unknown): void {
    if (!this.shouldLog("verbose")) return;

    console.log(
      this.pad(
        `   ${color(Colors.dot, Colors.textMuted)} ${color(key + ":", Colors.textMuted)} ${color(formatValue(value), Colors.textMuted)}`,
        Colors.bgGray,
      ),
    );
  }

  // --- Utility/Standard Logging (Compatibility) ---

  info(text: string, nodeId?: string): void {
    this.log({ level: "info", text, nodeId, timestamp: Date.now() });
  }

  warn(text: string, nodeId?: string): void {
    this.log({ level: "warn", text, nodeId, timestamp: Date.now() });
  }

  error(text: string, nodeId?: string): void {
    this.log({ level: "error", text, nodeId, timestamp: Date.now() });
  }

  success(text: string, nodeId?: string): void {
    this.log({ level: "success", text, nodeId, timestamp: Date.now() });
  }

  debug(text: string, nodeId?: string): void {
    this.log({ level: "debug", text, nodeId, timestamp: Date.now() });
  }

  private log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;
    this.consoleLogger.log(entry);
  }
}
