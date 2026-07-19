import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { VAR_TOKEN_RE, type VarStatus } from '../../lib/variables';

export function variableHighlight(statuses: ReadonlyMap<string, VarStatus>) {
  const matcher = new MatchDecorator({
    regexp: new RegExp(VAR_TOKEN_RE.source, VAR_TOKEN_RE.flags),
    decoration: (match) => {
      const name = match[1].trim();
      const state = statuses.get(name)?.state ?? 'unresolved';
      return Decoration.mark({
        class: `cm-var-token var-token--${state}`,
        attributes: { 'data-var-name': name },
      });
    },
  });

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = matcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = matcher.updateDeco(update, this.decorations);
    }
  }, { decorations: (plugin) => plugin.decorations });
}
