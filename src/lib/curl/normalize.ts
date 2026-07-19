export type CurlDialect = 'bash' | 'cmd' | 'powershell';

export function detectDialect(command: string): CurlDialect {
  if (/\^"/.test(command) || /\^\s*\r?\n/.test(command)) return 'cmd';
  if (/`\s*\r?\n/.test(command) || (/^\s*curl\.exe\b/i.test(command) && /`"/.test(command))) {
    return 'powershell';
  }
  return 'bash';
}

function normalizeEscapes(command: string, marker: '^' | '`'): string {
  let normalized = '';
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (char !== marker || i + 1 >= command.length) {
      normalized += char;
      continue;
    }

    const next = command[i + 1];
    if (next === '\r' && command[i + 2] === '\n') {
      normalized += ' ';
      i += 2;
    } else if (next === '\n') {
      normalized += ' ';
      i += 1;
    } else if (marker === '`' && next === 'n') {
      normalized += '\n';
      i += 1;
    } else if (marker === '`' && next === 't') {
      normalized += '\t';
      i += 1;
    } else if (marker === '`' && next === '"') {
      normalized += '\\"';
      i += 1;
    } else {
      normalized += next;
      i += 1;
    }
  }
  return normalized;
}

export function normalize(command: string): string {
  const dialect = detectDialect(command);
  if (dialect === 'cmd') return normalizeEscapes(command, '^').trim();
  if (dialect === 'powershell') return normalizeEscapes(command, '`').trim();
  return command.replace(/\\\r?\n/g, ' ').trim();
}
