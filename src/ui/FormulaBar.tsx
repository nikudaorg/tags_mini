import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  parse,
  renderSegments,
  splitComplete,
  type Graph,
  type ItemId,
  type Token,
} from '../domain';
import { cx } from './cx';

const opText = (t: Token): string =>
  t.kind === 'not' ? 'NOT' : t.kind === 'op' ? (t.op === 'and' ? 'AND' : 'OR') : '';

// The caret plus any operators typed there that await their term.
const Caret = ({ pending = [] }: { readonly pending?: readonly Token[] }) => (
  <>
    {pending.map((t, i) => (
      <span key={i} className="f-op f-pending">
        {i > 0 ? ' ' : ''}
        {opText(t)}
      </span>
    ))}
    <span className="caret" aria-hidden="true" />
  </>
);

// "A OR (B AND C)" with red operators and blue explicit brackets. Non-bracket
// segments map 1:1 onto the token stream in order, which is what lets a caret
// live between display segments while edits operate on tokens. Clicking a
// token's left half puts the caret before it, right half after.
export const Formula = ({
  tokens,
  graph,
  cursor,
  onCursor,
  pendingAtCaret = [],
}: {
  readonly tokens: readonly Token[];
  readonly graph: Graph;
  readonly cursor: number | null;
  readonly onCursor: ((at: number) => void) | null;
  readonly pendingAtCaret?: readonly Token[];
}) => {
  const { complete, pending } = splitComplete(tokens);
  const parsed = parse(complete);
  const editable = onCursor !== null;

  const clickAt = (index: number) => (e: ReactMouseEvent<HTMLSpanElement>) => {
    if (onCursor === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onCursor(e.clientX < rect.left + rect.width / 2 ? index : index + 1);
  };

  if (parsed.kind === 'empty' && pending.length === 0) {
    return (
      <div
        className={cx('formula', editable && 'editable')}
        role="status"
        onClick={editable ? () => onCursor(0) : undefined}
      >
        {cursor !== null && <Caret pending={pendingAtCaret} />}
        <span className="f-empty">
          Empty formula — everything on the right is shown
          {editable && cursor === null ? '. Click here or a tag to start.' : ''}
        </span>
      </div>
    );
  }

  const segments = parsed.kind === 'empty' ? [] : renderSegments(parsed.ast);
  let tokenIndex = 0;
  const out: Array<{ key: string; node: ReactNode }> = [];
  let prevBracket: '(' | ')' | null = null;
  let first = true;

  const pushCaret = (key: string) =>
    out.push({ key, node: <Caret pending={pendingAtCaret} /> });

  for (const [i, seg] of segments.entries()) {
    const tight =
      (seg.kind === 'bracket' && seg.text === ')') || (!first && prevBracket === '(');
    const spacer = !first && !tight ? ' ' : '';
    if (spacer) out.push({ key: `s${i}`, node: spacer });
    if (seg.kind === 'bracket') {
      out.push({
        key: `b${i}`,
        node: <span className="f-bracket">{seg.text}</span>,
      });
      prevBracket = seg.text;
    } else {
      const idx = tokenIndex++;
      if (cursor === idx) pushCaret(`c${i}`);
      const cls = seg.kind === 'term' ? 'f-term' : 'f-op';
      const text =
        seg.kind === 'term' ? (graph.items.get(seg.tagId as ItemId)?.name ?? '?') : seg.text;
      out.push({
        key: `t${i}`,
        node: (
          <span
            className={cx(cls, editable && 'f-token')}
            onClick={editable ? clickAt(idx) : undefined}
          >
            {text}
          </span>
        ),
      });
      prevBracket = null;
    }
    first = false;
  }
  for (const [i, t] of pending.entries()) {
    const idx = tokenIndex++;
    if (cursor === idx) pushCaret(`cp${i}`);
    if (out.length > 0) out.push({ key: `sp${i}`, node: ' ' });
    out.push({
      key: `p${i}`,
      node: (
        <span
          className={cx('f-op', 'f-pending', editable && 'f-token')}
          onClick={editable ? clickAt(idx) : undefined}
        >
          {opText(t)}
        </span>
      ),
    });
  }
  if (cursor !== null && cursor >= tokenIndex) pushCaret('cend');

  return (
    <div
      className={cx('formula', editable && 'editable')}
      role="status"
      aria-label="current formula"
      onClick={
        editable
          ? (e) => {
              if (e.target === e.currentTarget) onCursor(tokens.length);
            }
          : undefined
      }
    >
      {out.map(({ key, node }) => (
        <span key={key}>{node}</span>
      ))}
    </div>
  );
};
