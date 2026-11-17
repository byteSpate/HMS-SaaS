// A staff address that does not exist, or a record the screen reported missing with notFound():
// the not-found page inside the shell (Role Home v2 design, "Error page"). Implements: T-UI-02.
import { NotFoundPage } from '../../src/components/error-pages';

export default function SignedInNotFound() {
  return <NotFoundPage />;
}
