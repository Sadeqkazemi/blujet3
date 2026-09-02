import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CreateApiKeyDto } from '../../agencies/dto/create-api-key.dto';

export class CreateItApiClientDto extends CreateApiKeyDto {
  @ApiProperty({
    description: 'شناسهٔ حساب آژانس ثبت‌شده',
    example: 'b3ef96c2-5b20-4f58-862b-9c38eab2db25',
  })
  @IsUUID()
  agencyId: string;
}
