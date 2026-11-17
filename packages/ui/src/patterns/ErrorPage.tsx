// A page that could not be shown, drawn inside the shell so staff can still navigate and search
// (Role Home v2 design, "Error page"). Three kinds, each with a status badge: a server problem,
// a page that does not exist, and no connection. "No connection" never claims the last action
// failed: it says we are not sure yet, so nobody repeats a payment (F section 5). Plain-words
// steps, then the actions, then a reference for the administrator. Implements: T-UI-02,
// NFR-ACC-001.
import type { ReactNode } from 'react';
import { StatusBadge, type StatusKind } from '../primitives/StatusBadge.js';

export type ErrorPageKind = 'problem' | 'not-found' | 'offline';

const BADGE_STATUS: Record<ErrorPageKind, StatusKind> = {
  problem: 'problem',
  'not-found': 'idle',
  offline: 'attention',
};

export interface ErrorPageProps {
  kind: ErrorPageKind;
  /** Texts, already translated. */
  badge: string;
  title: string;
  body: string;
  stepsTitle: string;
  steps: readonly string[];
  /** Try again (primary) and Back to Home (secondary), in that order. */
  actions: ReactNode;
  /** A code or time the administrator can look up, or how often it checks again. */
  reference?: string;
}

export function ErrorPage({
  kind,
  badge,
  title,
  body,
  stepsTitle,
  steps,
  actions,
  reference,
}: ErrorPageProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <section
        aria-labelledby="error-page-title"
        className="flex flex-col items-start gap-4 rounded-panel border border-border bg-surface p-6"
      >
        <StatusBadge status={BADGE_STATUS[kind]} label={badge} />
        <div>
          <h1 id="error-page-title" className="text-2xl font-semibold">
            {title}
          </h1>
          <p className="mt-2">{body}</p>
        </div>
        <div>
          <h2 className="text-base font-semibold">{stepsTitle}</h2>
          <ol className="mt-1 list-decimal ps-5 text-text-muted">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
        {reference ? <p className="text-sm text-text-muted tabular-nums">{reference}</p> : null}
      </section>
    </div>
  );
}
