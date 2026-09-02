import { Module } from '@nestjs/common';
import { HttpPssClient } from './http-pss.client';
import { PSS_CLIENT } from './pss-client.interface';

@Module({
  providers: [
    HttpPssClient,
    { provide: PSS_CLIENT, useExisting: HttpPssClient },
  ],
  exports: [PSS_CLIENT],
})
export class PssModule {}
