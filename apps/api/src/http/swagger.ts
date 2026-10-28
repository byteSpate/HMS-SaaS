// Swagger (OpenAPI) document of the API, served at /docs with the raw spec at /docs-json.
// Endpoint shapes come from the shared contracts (ApiEndpoint in @hms/platform); this file adds
// the servers and the two credentials a browser sends: the session cookie and the CSRF header
// (ADR-004, ADR-021). To try a write in Swagger UI: sign in with POST /auth/login on the same
// origin (the cookie is set by the browser), then authorize "csrf" with the returned csrfToken.
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { SESSION_COOKIE } from '@hms/mod-identity-access';
import { CSRF_SECURITY, SESSION_SECURITY } from '@hms/platform';

export interface SwaggerServers {
  port: number;
  productionUrl: string;
}

export function buildOpenApiDocument(
  app: INestApplication,
  servers: SwaggerServers,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('HMS API')
    .setDescription(
      'Hospital ERP API (one installation per hospital, ADR-023). Errors are RFC 9457 ' +
        'problem+json with a stable `code`. Writes need the `X-CSRF-Token` header from the ' +
        'session response.',
    )
    .setVersion('1.0')
    .addServer(`http://localhost:${servers.port}`, 'Local development')
    .addServer(servers.productionUrl, 'Production')
    .addCookieAuth(
      SESSION_COOKIE,
      { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
      SESSION_SECURITY,
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'csrfToken from POST /auth/login or GET /auth/session',
      },
      CSRF_SECURITY,
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}
