// The predicate over one level's tags: a linear token stream (the entry order),
// parsed with NOT > AND > OR precedence, rendered with explicit brackets except
// around chains of the same operator.

export type BinaryOp = 'and' | 'or';

export type Token =
  | { readonly kind: 'term'; readonly tagId: string }
  | { readonly kind: 'op'; readonly op: BinaryOp }
  | { readonly kind: 'not' };

export type Ast =
  | { readonly kind: 'term'; readonly tagId: string }
  | { readonly kind: 'not'; readonly child: Ast }
  | { readonly kind: 'and'; readonly children: readonly Ast[] }
  | { readonly kind: 'or'; readonly children: readonly Ast[] };

// Entry appends only legal tokens, so a stream is always
// `not* term (op not* term)*` plus an optional trailing `op not*` / leading `not*`.
export const nextExpected = (tokens: readonly Token[]): 'term' | 'operator' => {
  const last = tokens[tokens.length - 1];
  if (last === undefined) return 'term';
  return last.kind === 'term' ? 'operator' : 'term';
};

// Longest valid complete prefix (ends at the last term) + the pending tail
// still being typed (`op`, `op not`, leading `not`, ...).
export const splitComplete = (
  tokens: readonly Token[],
): { readonly complete: readonly Token[]; readonly pending: readonly Token[] } => {
  let lastTerm = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]?.kind === 'term') {
      lastTerm = i;
      break;
    }
  }
  return { complete: tokens.slice(0, lastTerm + 1), pending: tokens.slice(lastTerm + 1) };
};

export const termIds = (tokens: readonly Token[]): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const t of tokens) if (t.kind === 'term') ids.add(t.tagId);
  return ids;
};

const chain = (op: BinaryOp, left: Ast, right: Ast): Ast => {
  const children = [
    ...(left.kind === op ? left.children : [left]),
    ...(right.kind === op ? right.children : [right]),
  ];
  return { kind: op, children };
};

// Recursive descent over a complete stream. Returns notFound for the empty
// stream (an empty predicate is `true` for every item — decided by the caller).
export const parse = (
  tokens: readonly Token[],
): { readonly kind: 'empty' } | { readonly kind: 'formula'; readonly ast: Ast } => {
  if (tokens.length === 0) return { kind: 'empty' };
  let pos = 0;
  const parseNot = (): Ast => {
    const t = tokens[pos];
    if (t === undefined) throw new Error('predicate stream ended mid-expression');
    if (t.kind === 'not') {
      pos++;
      return { kind: 'not', child: parseNot() };
    }
    if (t.kind !== 'term') throw new Error(`expected term, got ${t.kind}`);
    pos++;
    return { kind: 'term', tagId: t.tagId };
  };
  const parseBinary = (op: BinaryOp, parseInner: () => Ast): Ast => {
    let left = parseInner();
    while (true) {
      const t = tokens[pos];
      if (t === undefined || t.kind !== 'op' || t.op !== op) return left;
      pos++;
      left = chain(op, left, parseInner());
    }
  };
  const parseAnd = () => parseBinary('and', parseNot);
  const ast = parseBinary('or', parseAnd);
  if (pos !== tokens.length) throw new Error('trailing tokens in predicate stream');
  return { kind: 'formula', ast };
};

export const evaluate = (ast: Ast, has: (tagId: string) => boolean): boolean => {
  switch (ast.kind) {
    case 'term':
      return has(ast.tagId);
    case 'not':
      return !evaluate(ast.child, has);
    case 'and':
      return ast.children.every((c) => evaluate(c, has));
    case 'or':
      return ast.children.some((c) => evaluate(c, has));
  }
};

// True for the whole level when the predicate is empty; otherwise the parsed
// formula evaluated over the item's tagger set.
export const matches = (tokens: readonly Token[], taggers: ReadonlySet<string>): boolean => {
  const parsed = parse(splitComplete(tokens).complete);
  if (parsed.kind === 'empty') return true;
  return evaluate(parsed.ast, (id) => taggers.has(id));
};

export type Segment =
  | { readonly kind: 'term'; readonly tagId: string }
  | { readonly kind: 'op'; readonly text: 'AND' | 'OR' | 'NOT' }
  | { readonly kind: 'bracket'; readonly text: '(' | ')' };

const OP_TEXT: Record<BinaryOp, 'AND' | 'OR'> = { and: 'AND', or: 'OR' };

// Explicit brackets around every compound subexpression except at the root.
// Same-operator chains are flat by construction, so a chain never re-brackets
// its own operator: A o B a C a n A → A OR (B AND C AND (NOT A)).
export const renderSegments = (ast: Ast, root: boolean = true): readonly Segment[] => {
  const wrap = (inner: readonly Segment[]): readonly Segment[] =>
    root ? inner : [{ kind: 'bracket', text: '(' }, ...inner, { kind: 'bracket', text: ')' }];
  switch (ast.kind) {
    case 'term':
      return [{ kind: 'term', tagId: ast.tagId }];
    case 'not':
      return wrap([{ kind: 'op', text: 'NOT' }, ...renderSegments(ast.child, ast.child.kind === 'term')]);
    case 'and':
    case 'or': {
      const out: Segment[] = [];
      ast.children.forEach((child, i) => {
        if (i > 0) out.push({ kind: 'op', text: OP_TEXT[ast.kind] });
        out.push(...renderSegments(child, child.kind === 'term'));
      });
      return wrap(out);
    }
  }
};

// A legal stream is `not* term (op not* term)*` with an optional trailing
// `op not*` still being typed. Cursor edits must preserve this invariant.
export const isValidStream = (tokens: readonly Token[]): boolean => {
  let expect: 'term' | 'op' = 'term';
  for (const t of tokens) {
    if (t.kind === 'term') {
      if (expect !== 'term') return false;
      expect = 'op';
    } else if (t.kind === 'op') {
      if (expect !== 'op') return false;
      expect = 'term';
    } else if (expect !== 'term') {
      return false; // `not` only sits where a term could start
    }
  }
  return true;
};

export type CursorEdit = {
  readonly tokens: readonly Token[];
  readonly cursor: number;
};

// Insert at a cursor position, refusing edits that would break the grammar.
export const insertToken = (
  tokens: readonly Token[],
  cursor: number,
  token: Token,
): CursorEdit | null => {
  const at = Math.max(0, Math.min(cursor, tokens.length));
  const next = [...tokens.slice(0, at), token, ...tokens.slice(at)];
  return isValidStream(next) ? { tokens: next, cursor: at + 1 } : null;
};

// Delete the unit at the cursor ('back' = before it, 'forward' = at it).
// A `not` deletes alone (always legal); a term takes its `not` prefix and one
// joining operator with it; an operator takes its right operand. Trailing
// pending tokens delete alone.
export const deleteUnit = (
  tokens: readonly Token[],
  cursor: number,
  dir: 'back' | 'forward',
): CursorEdit | null => {
  const at = Math.max(0, Math.min(cursor, tokens.length));
  const t = dir === 'back' ? at - 1 : at;
  const target = tokens[t];
  if (target === undefined) return null;
  const cut = (from: number, to: number): CursorEdit => ({
    tokens: [...tokens.slice(0, from), ...tokens.slice(to + 1)],
    cursor: from,
  });
  if (target.kind === 'not') return cut(t, t);
  if (target.kind === 'op') {
    let m = t + 1;
    while (tokens[m]?.kind === 'not') m++;
    // no right operand yet: take the pending `not` run along, not just the op
    return tokens[m]?.kind === 'term' ? cut(t, m) : cut(t, m - 1);
  }
  let s = t;
  while (tokens[s - 1]?.kind === 'not') s--;
  // The term leaves its innermost chain: of the two adjacent operators, the
  // higher-precedence one bound the term, so that one goes with it (tie: left).
  const prec = (o: Token | undefined): number =>
    o !== undefined && o.kind === 'op' ? (o.op === 'and' ? 2 : 1) : 0;
  const left = tokens[s - 1];
  const right = tokens[t + 1];
  if (left?.kind === 'op' && prec(right) > prec(left)) return cut(s, t + 1);
  if (left?.kind === 'op') return cut(s - 1, t);
  if (right?.kind === 'op') return cut(s, t + 1);
  return cut(s, t);
};

// Plain-text form for tests and tooltips.
export const renderText = (
  tokens: readonly Token[],
  nameOf: (tagId: string) => string,
): string => {
  const { complete, pending } = splitComplete(tokens);
  const parsed = parse(complete);
  const head =
    parsed.kind === 'empty'
      ? ''
      : renderSegments(parsed.ast)
          .map((s) => (s.kind === 'term' ? nameOf(s.tagId) : s.text))
          .join(' ')
          .replace(/\( /g, '(')
          .replace(/ \)/g, ')');
  const tail = pending
    .map((t) => (t.kind === 'not' ? 'NOT' : t.kind === 'op' ? OP_TEXT[t.op] : ''))
    .join(' ');
  return [head, tail].filter((s) => s.length > 0).join(' ');
};
