// Any staff address no screen claims lands here, so the not-found page renders inside the shell
// (and its guard) instead of as a bare page. Real routes always win over this catch-all.
// Implements: T-UI-02.
import { notFound } from 'next/navigation';

export default function MissingPage(): never {
  notFound();
}
