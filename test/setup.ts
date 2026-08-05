/**
 * Lightweight jest-compatible `expect` shim for Node's built-in test runner.
 * The project's *.test.ts files use describe/it/expect; node --test provides
 * describe/it as globals, this module only supplies `expect`.
 * Loaded via `node --test --experimental-strip-types --import ./test/setup.ts`.
 */
import assert from 'node:assert';
import { describe, it, test, before, after, beforeEach, afterEach } from 'node:test';

// Ensure test globals exist regardless of how the test file is loaded.
(globalThis as any).describe = describe;
(globalThis as any).it = it;
(globalThis as any).test = test;
(globalThis as any).before = before;
(globalThis as any).after = after;
(globalThis as any).beforeEach = beforeEach;
(globalThis as any).afterEach = afterEach;

// jest-style `it.each` / `describe.each` (node:test exposes `.each` on `test`,
// but assign a small polyfill to be safe across versions).
function eachPolyfill(run: (name: string, fn: (...a: any[]) => any) => void) {
  const applyRows = (table: any[], name: any, fn: any) => {
    for (const row of table) {
      const args = Array.isArray(row) ? row : [row];
      const label = typeof name === 'string' ? name.replace(/%[sdjo]/g, () => String(args[0])) : String(name);
      run(label, () => fn(...args));
    }
  };
  return (table: any[], ...rest: any[]) => {
    if (rest.length >= 2) {
      applyRows(table, rest[0], rest[1]);
      return;
    }
    return (name: string, fn: (...a: any[]) => any) => applyRows(table, name, fn);
  };
}
(globalThis as any).it.each = eachPolyfill((n, f) => it(n, f));
(globalThis as any).describe.each = eachPolyfill((n, f) => describe(n, f));
(globalThis as any).test.each = eachPolyfill((n, f) => test(n, f));

function stringify(v: unknown): string {
  try {
    return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

type Matchers = Record<string, (...args: any[]) => any>;

function makeExpect(actual: unknown, isNot: boolean): any {
  const check = (pass: boolean, msg: string) => {
    if (pass !== !isNot) throw new Error(msg);
  };
  const m: Matchers = {
    toBe(expected: unknown) {
      check(Object.is(actual, expected), `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBe ${stringify(expected)}`);
    },
    toEqual(expected: unknown) {
      check(deepEqual(actual, expected), `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toEqual ${stringify(expected)}`);
    },
    toStrictEqual(expected: unknown) {
      m.toEqual(expected);
    },
    toBeTruthy() {
      check(!!actual, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeTruthy`);
    },
    toBeFalsy() {
      check(!actual, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeFalsy`);
    },
    toBeNull() {
      check(actual === null, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeNull`);
    },
    toBeUndefined() {
      check(actual === undefined, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeUndefined`);
    },
    toBeDefined() {
      check(actual !== undefined, `expected value ${isNot ? 'not ' : ''}toBeDefined`);
    },
    toContain(item: unknown) {
      const pass = Array.isArray(actual)
        ? actual.includes(item)
        : typeof actual === 'string' && typeof item === 'string'
          ? actual.includes(item)
          : false;
      check(pass, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toContain ${stringify(item)}`);
    },
    toContainEqual(item: unknown) {
      const pass = Array.isArray(actual)
        ? actual.some((el) => deepEqual(el, item))
        : false;
      check(pass, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toContainEqual ${stringify(item)}`);
    },
    toHaveLength(n: number) {
      const len = (actual as any)?.length;
      check(len === n, `expected length ${isNot ? 'not ' : ''}to be ${n}, got ${len}`);
    },
    toBeGreaterThan(n: number) {
      check((actual as number) > n, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeGreaterThan ${n}`);
    },
    toBeGreaterThanOrEqual(n: number) {
      check((actual as number) >= n, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeGreaterThanOrEqual ${n}`);
    },
    toBeLessThan(n: number) {
      check((actual as number) < n, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeLessThan ${n}`);
    },
    toBeLessThanOrEqual(n: number) {
      check((actual as number) <= n, `expected ${stringify(actual)} ${isNot ? 'not ' : ''}toBeLessThanOrEqual ${n}`);
    },
    toThrow(expected?: string | RegExp) {
      let threw = false;
      let err: any;
      try {
        (actual as () => void)();
      } catch (e) {
        threw = true;
        err = e;
      }
      let pass = threw;
      if (threw && expected) {
        const msg = String(err?.message ?? '');
        pass = typeof expected === 'string' ? msg.includes(expected) : expected.test(msg);
      }
      check(pass, `expected function ${isNot ? 'not ' : ''}toThrow${expected ? ' ' + stringify(expected) : ''}`);
    },
    toThrowError(expected?: string | RegExp) {
      m.toThrow(expected);
    },
  };
  const out: any = {};
  for (const k of Object.keys(m)) {
    out[k] = (...args: any[]) => {
      m[k](...args);
      return out;
    };
  }
  Object.defineProperty(out, 'not', {
    configurable: true,
    enumerable: true,
    get() {
      return makeExpect(actual, !isNot);
    },
  });
  // jest-style `.resolves` / `.rejects` for promise subjects.
  if (actual && typeof (actual as any).then === 'function') {
    const p = actual as Promise<any>;
    out.resolves = {
      toBe: async (e: unknown) => makeExpect(await p, isNot).toBe(e),
      toEqual: async (e: unknown) => makeExpect(await p, isNot).toEqual(e),
      toBeNull: async () => makeExpect(await p, isNot).toBeNull(),
      toBeDefined: async () => makeExpect(await p, isNot).toBeDefined(),
      toBeTruthy: async () => makeExpect(await p, isNot).toBeTruthy(),
      toBeFalsy: async () => makeExpect(await p, isNot).toBeFalsy(),
    };
    out.rejects = {
      toThrow: async (expected?: string | RegExp) => {
        let threw = false;
        let err: any;
        try {
          await p;
        } catch (e) {
          threw = true;
          err = e;
        }
        let pass = threw;
        if (threw && expected) {
          const msg = String(err?.message ?? '');
          pass = typeof expected === 'string' ? msg.includes(expected) : expected.test(msg);
        }
        if (pass !== !isNot) {
          throw new Error(`expected promise ${isNot ? 'not ' : ''}to reject${expected ? ' ' + stringify(expected) : ''}`);
        }
      },
    };
  }
  return out;
}

(globalThis as any).expect = (actual: unknown) => makeExpect(actual, false);
