// HTTP settings shared by main.ts and the HTTP tests: the Express layer of the request pipeline
// (D section 8.6, layers 1 to 3). Order matters: the request ID comes first so every later
// layer, including body-parser rejections, can report it. T-PLT-07, ADR-021.
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ProblemDetailsFilter, requestIdMiddleware } from '@hms/platform';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { buildCorsOptions, parseCorsOrigins } from './cors.js';

// D section 8.6 proposal. Larger uploads (attachments) go to object storage via presigned URLs,
// never through a JSON body. Bodies over this answer 413 PAYLOAD_TOO_LARGE.
export const JSON_BODY_LIMIT = '1mb';

export function configureApp(app: NestExpressApplication, corsOrigins: string | undefined): void {
  app.use(requestIdMiddleware);
  // Only the host nginx reaches the container (ports bind to 127.0.0.1), via loopback or the
  // Docker bridge. Trusting those hops makes req.ip the real visitor IP for audit and lockout.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.disable('x-powered-by');
  // HSTS is set by nginx for the whole host (J), so helmet does not send a second copy.
  app.use(helmet({ strictTransportSecurity: false }));
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(cookieParser());
  app.enableCors(buildCorsOptions(parseCorsOrigins(corsOrigins)));
  app.useGlobalFilters(new ProblemDetailsFilter());
  // D section 8 base path; /health stays at the root for proxy and deploy checks (ADR-021).
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
}
