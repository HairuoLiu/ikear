/**
 * Minimal ESM resolver hook: maps extensionless relative imports to .ts/.tsx/.js
 * so the project's TS test files run under `node --experimental-strip-types`
 * without modifying the import specifiers.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

export async function resolve(specifier, context, nextResolve) {
  const isRel = /^\.\.?\//.test(specifier) || specifier.startsWith('/');
  const hasExt = /\.[a-z0-9]+$/i.test(specifier);
  if (isRel && !hasExt && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const ext of EXTS) {
      if (existsSync(base + ext)) {
        return nextResolve(pathToFileURL(base + ext).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
