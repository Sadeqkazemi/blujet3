import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConnectFinancialIntegrationDto {
  @ApiProperty({
    description: 'Vendor credential; encrypted at rest and never returned',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  apiKey!: string;
}
