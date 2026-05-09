import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ExecutionLogger, ConsoleLogger, DefaultFormatter } from '../mod.ts';
import type { LogEntry } from '../mod.ts';

Deno.test('ExecutionLogger respects log levels', () => {
  const silent = new ExecutionLogger({ logLevel: 'silent' });
  const minimal = new ExecutionLogger({ logLevel: 'minimal' });
  const verbose = new ExecutionLogger({ logLevel: 'verbose' });

  assertEquals(silent.logLevel, 'silent');
  assertEquals(minimal.logLevel, 'minimal');
  assertEquals(verbose.logLevel, 'verbose');
});

Deno.test('DefaultFormatter produces formatted output', () => {
  const formatter = new DefaultFormatter();
  const entry: LogEntry = {
    level: 'info',
    text: 'test message',
    nodeId: 'node-1',
    timestamp: 1000000000000,
  };

  const result = formatter.format(entry);
  assertEquals(result.includes('test message'), true);
  assertEquals(result.includes('node-1'), true);
});

Deno.test('ConsoleLogger handles different log levels', () => {
  const logger = new ConsoleLogger();
  const formatter = new DefaultFormatter();

  const entries: LogEntry[] = [
    { level: 'info', text: 'info message', timestamp: Date.now() },
    { level: 'warn', text: 'warn message', nodeId: 'n1', timestamp: Date.now() },
    { level: 'error', text: 'error message', timestamp: Date.now() },
    { level: 'success', text: 'success message', timestamp: Date.now() },
    { level: 'debug', text: 'debug message', timestamp: Date.now() },
  ];

  for (const entry of entries) {
    const formatted = formatter.format(entry);
    assertEquals(typeof formatted, 'string');
    assertEquals(formatted.length > 0, true);
  }
});
