import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

const STEP_UP_SCOPES = [
  'ADMIN_ROLE_CHANGE',
  'API_KEY_ROTATE',
  'REFUND_PAYOUT',
  'PRICE_CAPACITY_CHANGE',
  'SESSION_REVOKE',
] as const;

export type StepUpScopeValue = (typeof STEP_UP_SCOPES)[number];

export class RequestStepUpDto {
  @ApiProperty({ enum: STEP_UP_SCOPES })
  @IsIn(STEP_UP_SCOPES)
  scope: StepUpScopeValue;
}

/** Mixed into any DTO whose endpoint requires step-up — see
 * docs/API.md Phase 15 for which endpoints and which scope. */
export class StepUpFieldsDto {
  @ApiProperty({
    description: 'Challenge id returned by POST /auth/step-up/request',
  })
  @IsString()
  stepUpChallengeId: string;

  @ApiProperty({ example: '482913', description: '6-digit one-time code' })
  @IsString()
  @Length(6, 6)
  stepUpCode: string;
}
