import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors';
import type { ChargeRuleDto } from './dto/flight-definition.dto';

export type NormalizedChargeRuleInput = {
  title: string;
  kind: 'TAX' | 'FEE';
  calculationMode: 'FIXED' | 'PERCENTAGE';
  fixedAmountIrr: bigint | null;
  percentageBasisPoints: number | null;
  cabin: 'ECONOMY' | 'COMFORT' | 'BUSINESS' | 'FIRST' | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  isActive: boolean;
};

export function normalizeChargeRuleInputs(
  rules: ChargeRuleDto[] | undefined,
): NormalizedChargeRuleInput[] {
  if (!rules?.length) return [];
  return rules.map((rule, index) => {
    const title = (rule.title ?? '').trim();
    if (!title) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `عنوان قانون شماره ${index + 1} الزامی است.`,
      });
    }

    const mode = rule.calculationMode;
    let fixedAmountIrr: bigint | null = null;
    let percentageBasisPoints: number | null = null;

    if (mode === 'FIXED') {
      if (rule.percentageBasisPoints != null) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `قانون «${title}»: در حالت FIXED فقط fixedAmountIrr مجاز است.`,
        });
      }
      if (rule.fixedAmountIrr == null) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `قانون «${title}»: fixedAmountIrr الزامی است.`,
        });
      }
      fixedAmountIrr = rule.fixedAmountIrr;
    } else if (mode === 'PERCENTAGE') {
      if (rule.fixedAmountIrr != null) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `قانون «${title}»: در حالت PERCENTAGE فقط percentageBasisPoints مجاز است.`,
        });
      }
      if (
        rule.percentageBasisPoints == null ||
        !Number.isInteger(rule.percentageBasisPoints) ||
        rule.percentageBasisPoints < 0 ||
        rule.percentageBasisPoints > 100_000
      ) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `قانون «${title}»: percentageBasisPoints باید عدد صحیح در بازه ۰ تا ۱۰۰۰۰۰ باشد.`,
        });
      }
      percentageBasisPoints = rule.percentageBasisPoints;
    } else {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `قانون «${title}»: calculationMode نامعتبر است.`,
      });
    }

    const fromRaw = rule.effectiveFrom ?? rule.validFrom ?? null;
    const toRaw = rule.effectiveTo ?? rule.validUntil ?? null;
    const effectiveFrom = fromRaw ? new Date(fromRaw) : null;
    const effectiveTo = toRaw ? new Date(toRaw) : null;
    if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `قانون «${title}»: تاریخ شروع نامعتبر است.`,
      });
    }
    if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `قانون «${title}»: تاریخ پایان نامعتبر است.`,
      });
    }
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: `قانون «${title}»: تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.`,
      });
    }

    const isActive = rule.isActive ?? rule.active ?? true;

    return {
      title,
      kind: rule.kind,
      calculationMode: mode,
      fixedAmountIrr,
      percentageBasisPoints,
      cabin: rule.cabin ?? null,
      effectiveFrom,
      effectiveTo,
      isActive,
    };
  });
}
