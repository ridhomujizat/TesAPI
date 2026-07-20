export function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => [key, stable((value as Record<string, unknown>)[key])]));
}

export const stableStringify = (value: unknown) => `${JSON.stringify(stable(value), null, 2)}\n`;
