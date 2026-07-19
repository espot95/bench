/**
 * Prompt/response reader that works for both a TTY and piped input. `readline/promises`
 * drops buffered lines when stdin is a pipe; this queues every line reliably.
 */

import * as readline from 'node:readline';

export interface LineReader {
  question(prompt: string): Promise<string | null>;
  close(): void;
}

export function createLineReader(): LineReader {
  const rl = readline.createInterface({ input: process.stdin });
  const pending: string[] = [];
  const waiters: Array<(line: string | null) => void> = [];
  let closed = false;

  rl.on('line', (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else pending.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) (waiters.shift() as (l: string | null) => void)(null);
  });

  return {
    question(prompt: string): Promise<string | null> {
      process.stdout.write(prompt);
      const buffered = pending.shift();
      if (buffered !== undefined) return Promise.resolve(buffered);
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close: () => rl.close(),
  };
}
