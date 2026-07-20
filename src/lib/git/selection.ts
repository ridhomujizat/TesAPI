export function toggleSelection(current: Set<string>, paths: string[]): Set<string> {
  const next = new Set(current);
  const remove = paths.every((path) => next.has(path));
  for (const path of paths) if (remove) next.delete(path); else next.add(path);
  return next;
}

export const canCommitSelection = (paths: Set<string>, message: string, busy: boolean): boolean =>
  paths.size > 0 && message.trim().length > 0 && !busy;

export function selectionState(selected: Set<string>, paths: string[]): { checked: boolean; mixed: boolean } {
  const count = paths.filter((path) => selected.has(path)).length;
  return { checked: paths.length > 0 && count === paths.length, mixed: count > 0 && count < paths.length };
}
