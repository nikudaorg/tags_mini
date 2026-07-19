export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
