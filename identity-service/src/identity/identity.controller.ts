import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdentityKeyService } from '../keys/identity-key.service';

@ApiTags('identity-internal')
@Controller('internal/v1/identity')
export class IdentityController {
  constructor(private readonly keys: IdentityKeyService) {}

  @Get('jwks.json')
  @ApiOperation({ summary: 'ارائهٔ کلید عمومی امضای JWT برای سرویس‌های داخلی' })
  getJwks() {
    return this.keys.getJwks();
  }
}
