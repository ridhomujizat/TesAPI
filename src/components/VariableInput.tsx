import { useCallback, useMemo, useRef, useState, type InputHTMLAttributes, type MouseEvent as ReactMouseEvent } from 'react';
import { splitVarSpans } from '../lib/variables';
import { useTextVariableStatuses } from '../store/variableStatus';
import { VariablePopover, type AnchorBox } from './VariablePopover';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value: string };

type OpenToken = { name: string; anchor: AnchorBox; pinned: boolean };

export function VariableInput({ value, className = '', onScroll, onInput, onKeyUp, onSelect, onMouseMove, onMouseLeave, onClick, onKeyDown, ...props }: Props) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hoverTimer = useRef(0);
  const closeTimer = useRef(0);
  const [open, setOpen] = useState<OpenToken | null>(null);
  const spans = useMemo(() => splitVarSpans(value), [value]);
  const hasTokens = spans.some((span) => 'varName' in span);
  const statuses = useTextVariableStatuses(value);

  const syncScroll = () => {
    window.requestAnimationFrame(() => {
      if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    });
  };

  const anchorFor = useCallback((name: string): AnchorBox | null => {
    const token = [...(mirrorRef.current?.querySelectorAll<HTMLElement>('[data-var-name]') ?? [])]
      .find((element) => element.dataset.varName === name);
    if (!token) return null;
    const rect = token.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }, []);

  const tokenAtPoint = (event: ReactMouseEvent<HTMLInputElement>): { name: string; anchor: AnchorBox } | null => {
    for (const token of mirrorRef.current?.querySelectorAll<HTMLElement>('[data-var-name]') ?? []) {
      const rect = token.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        return { name: token.dataset.varName ?? '', anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
      }
    }
    return null;
  };

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    window.clearTimeout(hoverTimer.current);
    if (open?.pinned) return;
    closeTimer.current = window.setTimeout(() => setOpen(null), 140);
  };

  return (
    <div className={`variable-input ${className}${props.disabled ? ' disabled' : ''}`}>
      <div ref={mirrorRef} className={`variable-input-mirror${hasTokens ? ' active' : ''}`} aria-hidden="true">
        {value ? spans.map((span, index) => 'varName' in span ? (
          <span
            className={`var-token var-token--${statuses.get(span.varName)?.state ?? 'unresolved'}`}
            data-var-name={span.varName}
            key={`${span.start}-${index}`}
          >
            {value.slice(span.start, span.end)}
          </span>
        ) : <span key={`${span.start}-${index}`}>{props.type === 'password' ? '\u2022'.repeat(span.text.length) : span.text}</span>) : <span className="variable-input-placeholder">{props.placeholder}</span>}
      </div>
      <input
        {...props}
        ref={inputRef}
        className={`variable-native-input${hasTokens ? ' mirrored' : ''}`}
        autoComplete={props.autoComplete ?? 'off'}
        value={value}
        onScroll={(event) => {
          if (mirrorRef.current) mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
          onScroll?.(event);
        }}
        onInput={(event) => { onInput?.(event); syncScroll(); }}
        onKeyUp={(event) => { onKeyUp?.(event); syncScroll(); }}
        onSelect={(event) => { onSelect?.(event); syncScroll(); }}
        onMouseMove={(event) => {
          onMouseMove?.(event);
          const token = tokenAtPoint(event);
          if (!token) {
            window.clearTimeout(hoverTimer.current);
            return;
          }
          if (open?.pinned || open?.name === token.name) return;
          window.clearTimeout(hoverTimer.current);
          hoverTimer.current = window.setTimeout(() => setOpen({ ...token, pinned: false }), 200);
        }}
        onMouseLeave={(event) => { onMouseLeave?.(event); scheduleClose(); }}
        onClick={(event) => {
          onClick?.(event);
          const token = tokenAtPoint(event);
          if (token) setOpen({ ...token, pinned: true });
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!((event.metaKey || event.ctrlKey) && event.key === '.')) return;
          const caret = event.currentTarget.selectionStart ?? -1;
          const span = spans.find((item) => 'varName' in item && caret >= item.start && caret <= item.end);
          if (!span || !('varName' in span)) return;
          const anchor = anchorFor(span.varName);
          if (anchor) {
            event.preventDefault();
            setOpen({ name: span.varName, anchor, pinned: true });
          }
        }}
      />
      {open && statuses.get(open.name) && (
        <VariablePopover
          status={statuses.get(open.name)!}
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  );
}
