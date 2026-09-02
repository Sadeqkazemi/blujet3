import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  IsIrrAmount,
  MinIrrAmount,
  TransformToIrr,
} from '../../../common/dto/irr.decorator';
import type { Irr } from '../../../common/money';
import { CabinClass } from '../../../database/enums';

const CABIN_CLASSES = Object.values(CabinClass);

/** Unified body for `POST /flights/:instanceId/commitments` — a charter
 * commitment when `agencyId` is omitted, an agency commitment when it's
 * present. `releaseAt` is this API's canonical end-of-period field name
 * (matches the pre-existing AgencyAllotment.releaseAt convention); it is
 * also accepted under the alias `endDate` — whichever is sent is used
 * (if both are sent, `releaseAt` wins). */
export class CreateCommitmentDto {
  @ApiProperty({ enum: CABIN_CLASSES })
  @IsIn(CABIN_CLASSES)
  cabin!: CabinClass;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(1)
  @Max(1000)
  seats!: number;

  @ApiProperty({
    type: String,
    example: '500000000',
    description: 'نرخ قراردادی (ریال)',
  })
  @IsIrrAmount()
  @MinIrrAmount(1n)
  @TransformToIrr()
  contractPriceIrr!: Irr;

  @ApiPropertyOptional({ description: 'شروع بازه تعهد (UTC ISO)' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'پایان بازه تعهد (UTC ISO) — نام معیار',
  })
  @IsOptional()
  @IsISO8601()
  releaseAt?: string;

  @ApiPropertyOptional({
    description:
      'مترادف releaseAt — در صورت ارسال هر دو، releaseAt اولویت دارد',
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'شناسه کاربری آژانس (AgencyProfile.userId) — وجود آن یعنی تعهد آژانس؛ نبود آن یعنی تعهد چارتر',
  })
  @IsOptional()
  @IsString()
  agencyId?: string;

  @ApiPropertyOptional({
    description: 'کلید idempotency برای جلوگیری از ثبت تکراری',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

/** Internal shape CommitmentsService works with once the charter/agency
 * branch has been decided — same fields as CreateCommitmentDto minus the
 * type-discriminating agencyId (carried separately by createAgency's own
 * parameter) and with releaseAt/endDate already resolved to one value. */
export interface ResolvedCommitmentInput {
  cabin: CabinClass;
  seats: number;
  contractPriceIrr: Irr;
  startDate?: string;
  releaseAt?: string;
  idempotencyKey?: string;
}
