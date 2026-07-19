import { describe, expect, test } from 'vitest';
import {
  deleteUnit,
  insertToken,
  isValidStream,
  matches,
  nextExpected,
  parse,
  renderText,
  splitComplete,
  type Token,
} from './predicate';

const term = (tagId: string): Token => ({ kind: 'term', tagId });
const op = (o: 'and' | 'or'): Token => ({ kind: 'op', op: o });
const not: Token = { kind: 'not' };

const names = (id: string) => id;

describe('parse + render', () => {
  test('spec example: A o B a C a n A → A OR (B AND C AND (NOT A))', () => {
    const tokens = [term('A'), op('or'), term('B'), op('and'), term('C'), op('and'), not, term('A')];
    expect(renderText(tokens, names)).toBe('A OR (B AND C AND (NOT A))');
  });

  test('same-operator chains stay flat', () => {
    const tokens = [term('A'), op('or'), term('B'), op('or'), term('C')];
    expect(renderText(tokens, names)).toBe('A OR B OR C');
  });

  test('and binds tighter than or on both sides', () => {
    const tokens = [term('A'), op('and'), term('B'), op('or'), term('C'), op('and'), term('D')];
    expect(renderText(tokens, names)).toBe('(A AND B) OR (C AND D)');
  });

  test('top-level not is unbracketed, nested not brackets its compound child', () => {
    expect(renderText([not, term('A')], names)).toBe('NOT A');
    expect(renderText([not, not, term('A')], names)).toBe('NOT (NOT A)');
  });

  test('pending tail renders after the complete prefix', () => {
    const tokens = [term('A'), op('and'), not];
    expect(renderText(tokens, names)).toBe('A AND NOT');
    expect(splitComplete(tokens).complete).toHaveLength(1);
  });

  test('empty stream parses to empty', () => {
    expect(parse([]).kind).toBe('empty');
  });
});

describe('nextExpected', () => {
  test('term at start, after operators and nots; operator after a term', () => {
    expect(nextExpected([])).toBe('term');
    expect(nextExpected([term('A')])).toBe('operator');
    expect(nextExpected([term('A'), op('and')])).toBe('term');
    expect(nextExpected([term('A'), op('and'), not])).toBe('term');
  });
});

describe('cursor edits', () => {
  // A OR (B AND C): tokens A(0) or(1) B(2) and(3) C(4)
  const abc = [term('A'), op('or'), term('B'), op('and'), term('C')];
  const text = (e: { tokens: readonly Token[] } | null) =>
    e === null ? null : renderText(e.tokens, names);

  test('valid and invalid insertions', () => {
    expect(isValidStream(abc)).toBe(true);
    expect(insertToken(abc, 2, term('X'))).toBeNull(); // term next to a term
    expect(insertToken(abc, 2, not)).not.toBeNull(); // A OR NOT B AND C
    expect(insertToken(abc, 1, op('and'))).toBeNull(); // two operators in a row
  });

  test('operator inserts only between a term and what follows', () => {
    expect(insertToken(abc, 0, op('and'))).toBeNull(); // op at start
    const mid = insertToken([term('A'), op('or'), term('B')], 2, not);
    expect(text(mid)).toBe('A OR (NOT B)');
    expect(mid?.cursor).toBe(3);
  });

  test('deleting a term takes its joining operator and NOT prefix', () => {
    expect(text(deleteUnit(abc, 5, 'back'))).toBe('A OR B'); // delete C ← from end
    expect(text(deleteUnit(abc, 0, 'forward'))).toBe('B AND C'); // delete A →
    expect(text(deleteUnit(abc, 2, 'forward'))).toBe('A OR C'); // delete middle B
    const withNot = [term('A'), op('and'), not, term('B')];
    expect(text(deleteUnit(withNot, 4, 'back'))).toBe('A'); // B takes NOT and AND along
  });

  test('deleting a lone NOT keeps the rest', () => {
    const withNot = [term('A'), op('and'), not, term('B')];
    expect(text(deleteUnit(withNot, 3, 'back'))).toBe('A AND B');
  });

  test('deleting a pending operator clears its NOT run too', () => {
    const pending = [term('A'), op('and'), not];
    expect(text(deleteUnit(pending, 1, 'forward'))).toBe('A');
    expect(isValidStream(deleteUnit(pending, 1, 'forward')!.tokens as Token[])).toBe(true);
  });

  test('every delete keeps the stream valid', () => {
    const streams = [abc, [not, term('A')], [term('A'), op('or'), not, not, term('B')]];
    for (const s of streams)
      for (let c = 0; c <= s.length; c++)
        for (const dir of ['back', 'forward'] as const) {
          const r = deleteUnit(s, c, dir);
          if (r !== null) expect(isValidStream(r.tokens)).toBe(true);
        }
  });
});

describe('matches', () => {
  const has = (ids: string[]) => new Set(ids);
  test('empty predicate is true for everything', () => {
    expect(matches([], has([]))).toBe(true);
  });
  test('precedence: A o B a C a n A over {A} and {B,C}', () => {
    const tokens = [term('A'), op('or'), term('B'), op('and'), term('C'), op('and'), not, term('A')];
    expect(matches(tokens, has(['A']))).toBe(true); // left disjunct
    expect(matches(tokens, has(['B', 'C']))).toBe(true); // right disjunct, no A
    expect(matches(tokens, has(['B', 'C', 'A']))).toBe(true); // A still wins via left disjunct
    expect(matches(tokens, has(['B']))).toBe(false);
    expect(matches(tokens, has([]))).toBe(false);
  });
  test('pending tail is ignored while evaluating', () => {
    expect(matches([term('A'), op('and')], has(['A']))).toBe(true);
    expect(matches([term('A'), op('and')], has([]))).toBe(false);
  });
});
