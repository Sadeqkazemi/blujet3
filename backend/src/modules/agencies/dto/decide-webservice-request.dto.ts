import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, ValidateIf } from 'class-validator';

export class DecideWebserviceRequestDto {
  @ApiProperty({ example: true, description: 'تأیید یا رد درخواست' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({
    description:
      'الزامی فقط هنگام تأیید — از POST /auth/step-up/request (scope: API_KEY_ROTATE)',
  })
  @ValidateIf((o: DecideWebserviceRequestDto) => o.approve === true)
  @IsString()
  stepUpChallengeId?: string;

  @ApiPropertyOptional({
    example: '482913',
    description: 'الزامی فقط هنگام تأیید',
  })
  @ValidateIf((o: DecideWebserviceRequestDto) => o.approve === true)
  @IsString()
  stepUpCode?: string;
}
