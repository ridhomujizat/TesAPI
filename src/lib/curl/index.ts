import { mapCurlArgs, type CurlParseResult } from './map.ts';
import { normalize } from './normalize.ts';
import { tokenize } from './tokenize.ts';

export type { CurlParseResult } from './map.ts';
export type { CurlDialect } from './normalize.ts';
export { detectDialect, normalize } from './normalize.ts';
export { tokenize } from './tokenize.ts';
export { toCurl, type CurlExportOptions } from './export.ts';

export function isCurlCommand(value: string): boolean {
  return /^curl(?:\.exe)?(?:\s|$)/i.test(value.replace(/^\uFEFF/, '').trimStart());
}

export function parseCurl(command: string): CurlParseResult {
  try {
    if (!isCurlCommand(command)) return { ok: false, error: 'Input is not a cURL command.' };
    const result = tokenize(normalize(command));
    return result.ok ? mapCurlArgs(result.argv) : result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not parse cURL command.' };
  }
}
