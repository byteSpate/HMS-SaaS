// Structured forms for fictional bilingual content; no JSON, HTML or code editor.
// Implements: T-CMS-DEMO-01, C-087, C-092.
'use client';
import {
  Button,
  Field,
  Select,
  TextArea,
  TextInput,
  type FieldControlProps,
  type SelectOption,
} from '@hms/ui';
import { cmsFieldId } from './validation';
import type { CmsMessages } from './messages';
interface Props {
  value: unknown;
  onChange: (value: unknown) => void;
  messages: CmsMessages;
  name?: string;
  assets: string[];
  disabled?: boolean;
  template?: unknown;
  path?: (string | number)[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function labelFor(name: string, m: CmsMessages) {
  return m.fields[name as keyof typeof m.fields] ?? name;
}
function optionsFor(name: string, m: CmsMessages, assets: string[]): SelectOption[] | undefined {
  switch (name) {
    case 'preset':
      return [
        { value: 'clinical', label: m.clinical },
        { value: 'spacious', label: m.spacious },
      ];
    case 'font':
      return [
        { value: 'hind', label: m.hind },
        { value: 'noto', label: m.noto },
      ];
    case 'src':
      return [
        { value: '', label: m.off },
        ...assets.map((src) => ({ value: src, label: src.replace('/images/', '') })),
      ];
    case 'imageSide':
      return [
        { value: 'start', label: m.imageStart },
        { value: 'end', label: m.imageEnd },
      ];
    default:
      return undefined;
  }
}
function ArrayEditor(props: Props & { value: unknown[] }) {
  const { value, onChange, messages: m, name = '', disabled } = props;
  const initial = Array.isArray(props.template) ? props.template : [];
  const sample = initial[0] ?? value[0];
  function move(index: number) {
    const next = [...value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }
  return (
    <fieldset className="min-w-0 space-y-4 border-t border-border pt-4">
      <legend className="font-ui font-semibold">{labelFor(name, m)}</legend>
      {value.map((item, index) => (
        <div key={index} className="space-y-3 border-b border-border pb-4">
          <ValueEditor
            {...props}
            value={item}
            path={[...(props.path ?? []), index]}
            template={sample}
            onChange={(next) => onChange(value.map((old, i) => (i === index ? next : old)))}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={disabled || index === 0} onClick={() => move(index)}>
              {m.moveUp}
            </Button>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              {m.remove}
            </Button>
          </div>
        </div>
      ))}
      {sample !== undefined ? (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => onChange([...value, structuredClone(sample)])}
        >
          {m.addItem}
        </Button>
      ) : null}
    </fieldset>
  );
}
function ObjectEditor(props: Props & { value: Record<string, unknown> }) {
  const { value, onChange, name = '', messages: m } = props;
  const fields = Object.entries(value).filter(([key]) => key !== 'id' && key !== 'type');
  if ('slot' in value && !('src' in value)) fields.push(['src', '']);
  if ('logo' in value && !('favicon' in value)) fields.push(['favicon', value.logo]);
  const children = fields.map(([key, child]) => (
    <ValueEditor
      {...props}
      key={key}
      name={key}
      value={child}
      path={[...(props.path ?? []), key]}
      template={isRecord(props.template) ? props.template[key] : undefined}
      onChange={(next) => {
        const updated = { ...value, [key]: next };
        if (key === 'src' && !next) delete updated.src;
        onChange(updated);
      }}
    />
  ));
  if (!name) return <div className="grid min-w-0 gap-5">{children}</div>;
  return (
    <fieldset className="grid min-w-0 gap-4 border-t border-border pt-4">
      <legend className="font-semibold">{labelFor(name, m)}</legend>
      {children}
    </fieldset>
  );
}
function ScalarControl({ control, props }: { control: FieldControlProps; props: Props }) {
  const { value, onChange, name = '', messages: m, assets, disabled } = props;
  const options = optionsFor(name, m, assets);
  if (options)
    return (
      <Select
        {...control}
        disabled={disabled}
        value={String(value ?? '')}
        options={options}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  if (typeof value === 'number')
    return (
      <TextInput
        {...control}
        disabled={disabled}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    );
  if (name === 'primaryOverride')
    return (
      <TextInput
        {...control}
        disabled={disabled}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value || null)}
      />
    );
  let lang: string | undefined;
  if (name === 'bn') lang = 'bn-BD';
  if (name === 'en') lang = 'en';
  return (
    <TextArea
      {...control}
      disabled={disabled}
      rows={lang ? 2 : 1}
      lang={lang}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
function EditorValue(props: Props) {
  const { value, onChange, name = '', messages: m, disabled } = props;
  if (Array.isArray(value)) return <ArrayEditor {...props} value={value} />;
  if (isRecord(value)) return <ObjectEditor {...props} value={value} />;
  const label = labelFor(name, m);
  if (typeof value === 'boolean')
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="font-ui text-sm font-medium">{label}</span>
        <Button
          variant="secondary"
          aria-label={label}
          aria-pressed={value}
          disabled={disabled}
          onClick={() => onChange(!value)}
        >
          {value ? m.on : m.off}
        </Button>
      </div>
    );
  let hint: string | undefined;
  if (name === 'primaryOverride') hint = m.colorHint;
  if (name === 'src') hint = m.assetHint;
  return (
    <Field label={label} hint={hint}>
      {(control) => <ScalarControl control={control} props={props} />}
    </Field>
  );
}

export function ValueEditor(props: Props) {
  return (
    <div id={cmsFieldId(props.path ?? [])}>
      <EditorValue {...props} />
    </div>
  );
}
