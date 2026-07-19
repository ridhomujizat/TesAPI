import { useMemo } from 'react';
import type { TesApiRequest } from '../types';
import { requestVariables, splitVarSpans, statusFor, type VarStatus } from '../lib/variables';
import { useEnvironmentStore } from './environmentStore';

export function useTextVariableStatuses(text: string): Map<string, VarStatus> {
  const file = useEnvironmentStore((state) => state.file);
  const names = useMemo(() => {
    const found = new Set<string>();
    if (text.includes('{{')) for (const span of splitVarSpans(text)) if ('varName' in span) found.add(span.varName);
    return [...found];
  }, [text]);
  const signature = names.join('\u0000');
  return useMemo(() => {
    const statuses = new Map<string, VarStatus>();
    for (const name of names) statuses.set(name, statusFor(name, file));
    return statuses;
    // The signature keeps the map stable while ordinary text changes around the same tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, signature]);
}

export function useRequestVariables(request: TesApiRequest): VarStatus[] {
  const file = useEnvironmentStore((state) => state.file);
  return useMemo(() => requestVariables(request, file), [file, request]);
}
