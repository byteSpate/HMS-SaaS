import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@hms/contracts';
import { Public } from '@hms/mod-identity-access';
import { RawResponse } from '@hms/platform';

// Liveness for the proxy and deploy checks; no session needed. Raw, because those checks read this
// plain shape (D section 8.6).
@Public()
@RawResponse()
@ApiTags('health')
@Controller('health')
export class HealthController {
  @ApiOperation({ summary: 'Health check' })
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'api', time: new Date().toISOString() };
  }
}
