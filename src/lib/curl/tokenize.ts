export type TokenizeResult =
  | { ok: true; argv: string[] }
  | { ok: false; error: string };

function ansiEscape(input: string, index: number): { value: string; next: number } {
  const char = input[index];
  if (char === 'n') return { value: '\n', next: index };
  if (char === 't') return { value: '\t', next: index };
  if (char === 'r') return { value: '\r', next: index };
  if (char === "'") return { value: "'", next: index };
  if (char === '\\') return { value: '\\', next: index };
  if (char === 'x' && /^[0-9a-f]{2}$/i.test(input.slice(index + 1, index + 3))) {
    return { value: String.fromCharCode(Number.parseInt(input.slice(index + 1, index + 3), 16)), next: index + 2 };
  }
  return { value: char, next: index };
}

export function tokenize(command: string): TokenizeResult {
  const argv: string[] = [];
  let token = '';
  let started = false;
  let quote: 'single' | 'double' | 'ansi' | null = null;

  const flush = () => {
    if (!started) return;
    argv.push(token);
    token = '';
    started = false;
  };

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote === 'single') {
      if (char === "'") quote = null;
      else token += char;
      continue;
    }

    if (quote === 'ansi') {
      if (char === "'") {
        quote = null;
      } else if (char === '\\') {
        if (i + 1 >= command.length) return { ok: false, error: 'Trailing escape in ANSI-C string.' };
        const decoded = ansiEscape(command, i + 1);
        token += decoded.value;
        i = decoded.next;
      } else {
        token += char;
      }
      continue;
    }

    if (quote === 'double') {
      if (char === '"') {
        quote = null;
      } else if (char === '\\') {
        const next = command[i + 1];
        if (next === '"' || next === '\\') {
          token += next;
          i += 1;
        } else {
          token += char;
        }
      } else {
        token += char;
      }
      continue;
    }

    if (/\s/.test(char)) {
      flush();
    } else if (char === "'") {
      started = true;
      quote = 'single';
    } else if (char === '"') {
      started = true;
      quote = 'double';
    } else if (char === '$' && command[i + 1] === "'") {
      started = true;
      quote = 'ansi';
      i += 1;
    } else if (char === '\\') {
      if (i + 1 >= command.length) return { ok: false, error: 'Trailing escape in cURL command.' };
      started = true;
      token += command[i + 1];
      i += 1;
    } else {
      started = true;
      token += char;
    }
  }

  if (quote) return { ok: false, error: 'Unclosed quote in cURL command.' };
  flush();

  const splitArgv = argv.flatMap((arg) => {
    const match = arg.match(/^(--[a-z0-9][a-z0-9-]*)=(.*)$/i);
    return match ? [match[1], match[2]] : [arg];
  });
  return { ok: true, argv: splitArgv };
}
