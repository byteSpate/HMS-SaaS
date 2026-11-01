// Rule tests for the reuse guardrails (T-UI-01, ADR-022 section 9).
// Each case lints a snippet as if it lived at the given path and checks the rule fires or not.
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { uiGuardrails, webGuardrails } from './index.js';

// fileURLToPath, not URL.pathname: on Windows the pathname is "/C:/...", which is not absolute.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    ...webGuardrails,
    ...uiGuardrails,
  ],
});

async function messagesFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: `${repoRoot}${filePath}` });
  return result.messages.map((m) => m.message);
}

const WEB = 'apps/web/app/example/page.tsx';
const UI = 'packages/ui/src/primitives/Example.tsx';

describe('web guardrails', () => {
  it.each(['button', 'input', 'select', 'textarea', 'dialog'])(
    'rejects a raw <%s> element in apps/web',
    async (tag) => {
      const messages = await messagesFor(`export const A = () => <${tag} />;`, WEB);
      expect(messages.join(' ')).toContain('@hms/ui');
    },
  );

  it('allows a component from the design system', async () => {
    const messages = await messagesFor(
      "import { Button } from '@hms/ui'; export const A = () => <Button>Save</Button>;",
      WEB,
    );
    expect(messages).toEqual([]);
  });

  it('rejects a hex color in a class string', async () => {
    const messages = await messagesFor("export const a = 'bg-[#00786f] text-white';", WEB);
    expect(messages.join(' ')).toContain('Color literals');
  });

  it('rejects a color function', async () => {
    const messages = await messagesFor("export const a = 'rgb(0, 120, 111)';", WEB);
    expect(messages.join(' ')).toContain('Color functions');
  });

  it('allows an anchor-like string that is not a color', async () => {
    const messages = await messagesFor("export const a = '#main-content';", WEB);
    expect(messages).toEqual([]);
  });

  it('rejects ad-hoc number and date formatting', async () => {
    const intl = await messagesFor('export const a = new Intl.NumberFormat("en");', WEB);
    const locale = await messagesFor('export const a = (1000).toLocaleString();', WEB);
    expect(intl.join(' ')).toContain('i18n formatters');
    expect(locale.join(' ')).toContain('i18n formatters');
  });

  it("rejects 'use server' in apps/web", async () => {
    const messages = await messagesFor("'use server';\nexport const a = 1;", WEB);
    expect(messages.join(' ')).toContain('use server');
  });

  it('rejects importing an icon library directly', async () => {
    const messages = await messagesFor("import { X } from '@phosphor-icons/react';", WEB);
    expect(messages.join(' ')).toContain('Icon component');
  });

  it('exempts tests and e2e specs', async () => {
    const test = await messagesFor("export const a = '#00786f';", 'apps/web/app/x.test.tsx');
    const e2e = await messagesFor("export const a = '#00786f';", 'apps/web/e2e/x.spec.ts');
    expect(test).toEqual([]);
    expect(e2e).toEqual([]);
  });
});

describe('site guardrails (P-030)', () => {
  const SITE = 'apps/site/app/[locale]/example/page.tsx';

  it('rejects raw widgets, color literals and direct icon imports in apps/site', async () => {
    const widget = await messagesFor('export const A = () => <button />;', SITE);
    const color = await messagesFor("export const a = 'bg-[#00786f]';", SITE);
    const icon = await messagesFor("import { X } from '@phosphor-icons/react';", SITE);
    expect(widget.join(' ')).toContain('@hms/ui');
    expect(color.join(' ')).toContain('Color literals');
    expect(icon.join(' ')).toContain('Icon component');
  });

  it('exempts site e2e specs', async () => {
    const e2e = await messagesFor("export const a = '#00786f';", 'apps/site/e2e/x.spec.ts');
    expect(e2e).toEqual([]);
  });
});

describe('ui guardrails', () => {
  it('allows raw widgets inside the design system', async () => {
    const messages = await messagesFor('export const A = () => <button type="button" />;', UI);
    expect(messages).toEqual([]);
  });

  it('rejects color literals and formatting in components', async () => {
    const color = await messagesFor("export const a = 'text-[#fff]';", UI);
    const format = await messagesFor('export const a = (1).toLocaleString();', UI);
    expect(color.join(' ')).toContain('Color literals');
    expect(format.join(' ')).toContain('i18n formatters');
  });

  it('allows the icon library only inside src/icons', async () => {
    const outside = await messagesFor("import { X } from '@phosphor-icons/react';", UI);
    const inside = await messagesFor(
      "import { X } from '@phosphor-icons/react';",
      'packages/ui/src/icons/Icon.tsx',
    );
    expect(outside.join(' ')).toContain('Icon component');
    expect(inside).toEqual([]);
  });
});
