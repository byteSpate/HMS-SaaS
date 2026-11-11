import { Module } from '@nestjs/common';
import { BillingModule } from '@hms/mod-billing';
import { ClinicalModule } from '@hms/mod-clinical';
import { IdentityAccessModule, loadAuthConfig } from '@hms/mod-identity-access';
import { PatientsModule } from '@hms/mod-patients';
import { SchedulingModule } from '@hms/mod-scheduling';
import { DatabaseModule, parseEncryptionKey, RequestPipelineModule } from '@hms/platform';
import { AppController } from './app.controller.js';
import { PoliciesController } from './config/policies.controller.js';
import { HealthController } from './health/health.controller.js';
import { parseCorsOrigins } from './http/cors.js';
import { OperationsController } from './operations/operations.controller.js';

// HTTP composition root: imports mod-* modules through their public index only (D §5).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

@Module({
  imports: [
    // First, so the request context and request log wrap every module's routes (D section 8.6).
    RequestPipelineModule.forRoot(),
    DatabaseModule.forRoot(requireEnv('DATABASE_URL')),
    IdentityAccessModule.forRoot(loadAuthConfig(process.env), undefined, {
      allowedOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
      ...(process.env.VALKEY_URL ? { valkeyUrl: process.env.VALKEY_URL } : {}),
    }),
    // Required: national IDs are sealed with it (T-PAT-03), so a missing key stops the start.
    PatientsModule.forRoot({
      nidKey: parseEncryptionKey('NID_ENCRYPTION_KEY', process.env.NID_ENCRYPTION_KEY ?? ''),
    }),
    SchedulingModule.forRoot(),
    BillingModule.forRoot(),
    ClinicalModule.forRoot(),
  ],
  controllers: [AppController, HealthController, OperationsController, PoliciesController],
})
export class AppModule {}
