import { cx, mergeStyles } from './cx';

describe('cx', () => {
  const a = { color: 'red' };
  const b = { fontSize: 12 };

  it('returns an empty array when given nothing', () => {
    expect(cx()).toEqual([]);
  });

  it('keeps truthy style objects in order', () => {
    expect(cx(a, b)).toEqual([a, b]);
  });

  it('drops falsy entries', () => {
    expect(cx(a, false, null, undefined, '' as any, 0 as any, b)).toEqual([a, b]);
  });

  it('supports the `cond && style` pattern', () => {
    const active = false;
    const inactive = true;
    expect(cx(a, active && b)).toEqual([a]);
    expect(cx(a, inactive && b)).toEqual([a, b]);
  });

  it('flattens nested arrays', () => {
    expect(cx([a, [b, [a]]])).toEqual([a, b, a]);
  });

  it('does not mutate the inputs', () => {
    const input = { color: 'red' };
    const out = cx(input);
    out.push({ color: 'blue' });
    expect(input).toEqual({ color: 'red' });
  });
});

describe('mergeStyles', () => {
  it('merges into a single object with later entries winning', () => {
    expect(mergeStyles({ color: 'red', fontSize: 12 }, { color: 'blue' })).toEqual({
      color: 'blue',
      fontSize: 12,
    });
  });

  it('ignores falsy and flattens nested entries', () => {
    expect(mergeStyles([{ a: 1 }, false as any], null, [[{ b: 2 }]])).toEqual({ a: 1, b: 2 });
  });

  it('returns an empty object when nothing is passed', () => {
    expect(mergeStyles()).toEqual({});
  });
});
