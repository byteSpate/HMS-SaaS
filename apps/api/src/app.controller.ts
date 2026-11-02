import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { apiStatusSchema, type ApiStatus } from '@hms/contracts';
import { Public } from '@hms/mod-identity-access';
import { ApiEndpoint } from '@hms/platform';

// Root status route: confirms the API is up and which port it bound to. No session needed.
@Public()
@ApiTags('status')
@Controller()
export class AppController {
  @ApiEndpoint({
    summary: 'Server status and bound port',
    success: { status: 200, description: 'The API is up', schema: apiStatusSchema },
    errors: [],
  })
  @Get()
  status(): ApiStatus {
    const port = process.env.API_PORT ?? 4100;
    return { message: `NEST server is running on port ${port}` };
  }
}
