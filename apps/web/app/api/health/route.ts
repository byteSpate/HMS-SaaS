// Container health check for the staff app (T-FND-05, K section 5). Static on purpose: it calls no
// backend, so an API outage does not make the orchestrator restart a healthy web container.
export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json({ status: 'ok', service: 'web' });
}
