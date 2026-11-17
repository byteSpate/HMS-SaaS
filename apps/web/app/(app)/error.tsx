'use client';
// A screen inside the shell failed while rendering: the problem page takes its place, the menu
// and the search stay usable, and the digest is shown so the administrator can find the server
// log entry (Role Home v2 design, "Error page"). Implements: T-UI-02, F section 5.
import { ProblemPage } from '../../src/components/error-pages';

export default function SignedInError({ error, retry }: { error: unknown; retry: () => void }) {
  // A value thrown in a client component may not be an Error (Next 16 error.js reference).
  const code = error instanceof Error && 'digest' in error ? String(error.digest) : undefined;
  return <ProblemPage code={code} onRetry={retry} />;
}
