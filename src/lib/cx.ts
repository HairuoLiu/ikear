/**
 * Style helpers — pure TypeScript, no React Native imports so they stay
 * trivially unit-testable.
 */

export type Falsy = false | null | undefined | '' | 0;

/** A style entry: an object, a nested array of entries, or a falsy value. */
export type StyleInput<T> = T | Falsy | StyleInput<T>[];

/**
 * Flatten style inputs into a single array, dropping falsy entries.
 * Mirrors the `clsx` ergonomics for RN style props:
 *   style={cx(styles.row, active && styles.active, [styles.a, cond && styles.b])}
 */
export function cx<T extends object>(...inputs: StyleInput<T>[]): T[] {
  const out: T[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      out.push(...cx<T>(...input));
    } else {
      out.push(input as T);
    }
  }
  return out;
}

/** Shallow-merge style inputs into one object (later entries win). */
export function mergeStyles<T extends object>(...inputs: StyleInput<T>[]): T {
  return Object.assign({}, ...cx<T>(...inputs)) as T;
}
