export interface DiffRow {
  kind: 'same' | 'changed' | 'fold';
  before?: string;
  after?: string;
  count?: number;
  lines?: string[];
}

function normalizedLines(value: unknown): string[] {
  if (value == null) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const sort = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(sort);
      if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]));
      return input;
    };
    return JSON.stringify(sort(parsed), null, 2)?.split('\n') ?? [];
  } catch {
    return String(value).split('\n');
  }
}

type Op = { type: 'same' | 'delete' | 'add'; before?: string; after?: string };

function diffOps(before: string[], after: string[]): Op[] {
  const dp = Array.from({ length: before.length + 1 }, () => Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) for (let j = after.length - 1; j >= 0; j -= 1) dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result: Op[] = [];
  let i = 0; let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { result.push({ type: 'same', before: before[i], after: after[j] }); i += 1; j += 1; }
    else if (j < after.length && (i === before.length || dp[i][j + 1] >= dp[i + 1][j])) { result.push({ type: 'add', after: after[j++] }); }
    else result.push({ type: 'delete', before: before[i++] });
  }
  return result;
}

export function lineDiff(before: unknown, after: unknown): DiffRow[] {
  const ops = diffOps(normalizedLines(before), normalizedLines(after));
  const rows: DiffRow[] = [];
  let index = 0;
  while (index < ops.length) {
    if (ops[index].type === 'same') {
      let end = index; while (end < ops.length && ops[end].type === 'same') end += 1;
      const count = end - index;
      if (count > 3) rows.push({ kind: 'fold', count, lines: ops.slice(index, end).flatMap((operation) => operation.before == null ? [] : [operation.before]) });
      else for (let cursor = index; cursor < end; cursor += 1) rows.push({ kind: 'same', before: ops[cursor].before, after: ops[cursor].after });
      index = end;
      continue;
    }
    const before: string[] = []; const after: string[] = [];
    while (index < ops.length && ops[index].type !== 'same') { if (ops[index].before != null) before.push(ops[index].before!); if (ops[index].after != null) after.push(ops[index].after!); index += 1; }
    const count = Math.max(before.length, after.length);
    for (let cursor = 0; cursor < count; cursor += 1) rows.push({ kind: 'changed', before: before[cursor], after: after[cursor] });
  }
  return rows;
}
