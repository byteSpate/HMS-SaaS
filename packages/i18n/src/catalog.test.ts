// Catalog checks (T-I18N-01, FR-I18N-002, ADR-017): both languages define the same keys with the
// same placeholders, nothing is empty, and no key is left unused. Missing keys also fail the
// TypeScript build, because the Bangla catalog is typed against the English one.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { messages } from './index.js';

type Tree = { [key: string]: string | Tree };

function leafPaths(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leafPaths(value, `${prefix}${key}.`),
  );
}

const en = new Map(leafPaths(messages.en));
const bn = new Map(leafPaths(messages['bn-BD']));

function placeholders(message: string): string[] {
  // The argument name is the first token after an opening brace: {name} or {count, plural, ...}.
  // Plural branches such as {# minutes} start with "#" and are not arguments.
  const names = message
    .split('{')
    .slice(1)
    .map((part) => (part.split(/[,}]/)[0] ?? '').trim())
    .filter((name) => /^\w+$/.test(name));
  return [...new Set(names)].sort();
}

describe('catalogs', () => {
  it('define the same keys in English and Bangla', () => {
    expect([...bn.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it('have no empty message', () => {
    for (const [key, value] of [...en, ...bn]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('use the same placeholders in both languages', () => {
    for (const [key, value] of en) {
      expect(placeholders(bn.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });
});

// Keys built from a code at runtime (API error codes) are found by their prefix.
const DYNAMIC_PREFIXES = ['errors.api.'];
const root = fileURLToPath(new URL('../../../', import.meta.url));

function listFiles(directory: string): string[] {
  try {
    return readdirSync(directory, { recursive: true, encoding: 'utf8' });
  } catch {
    return []; // a source folder that does not exist yet has no keys to use
  }
}

function sourceText(): string {
  const dirs = ['apps/web/app', 'apps/web/src', 'packages/ui/src', 'packages/print-templates/src'];
  const chunks: string[] = [];
  for (const dir of dirs) {
    for (const entry of listFiles(`${root}${dir}`)) {
      if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
        chunks.push(readFileSync(`${root}${dir}/${entry}`, 'utf8'));
      }
    }
  }
  return chunks.join('\n');
}

describe('catalog usage', () => {
  it('has no key that no screen or component uses', () => {
    const text = sourceText();
    const unused = [...en.keys()].filter((key) => {
      if (DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        return !DYNAMIC_PREFIXES.some((prefix) => text.includes(`${prefix}$`));
      }
      return !(
        text.includes(`'${key}'`) ||
        text.includes(`"${key}"`) ||
        text.includes(`\`${key}\``)
      );
    });
    expect(unused).toEqual([]);
  });
});
