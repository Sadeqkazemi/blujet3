import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { toIrr } from '../money';

/**
 * Validates a client-supplied IRR amount. Money is `bigint` everywhere
 * server-side (see common/money.ts) but arrives over JSON as either a plain
 * integer (small/legacy clients) or a decimal string (large amounts — a JS
 * `number` can't safely hold IRR values above 2^53, so the frontend sends
 * money fields as strings). Rejects floats/non-integer strings so a
 * fractional rial can never enter the system.
 */
export function IsIrrAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIrrAmount',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        // NestJS's ValidationPipe applies class-transformer's @Transform
        // before class-validator runs, so this may see either the raw
        // input (string/number) or the already-@TransformToIrr()-converted
        // bigint — accept whichever form is present.
        validate(value: unknown): boolean {
          if (typeof value === 'bigint') return true;
          if (typeof value === 'number') return Number.isInteger(value);
          if (typeof value === 'string') return /^-?\d+$/.test(value);
          return false;
        },
        defaultMessage(): string {
          return 'مبلغ باید عدد صحیح ریال (بدون اعشار) باشد';
        },
      },
    });
  };
}

/** Bigint-safe minimum check — class-validator's own @Min() assumes a JS
 * `number` and mishandles bigint. Pairs with @IsIrrAmount(); put it BEFORE
 * @TransformToIrr() in the decorator list so it still runs against a valid
 * bigint (validators run bottom-up relative to where they're declared —
 * @TransformToIrr converts during the earlier class-transformer pass
 * regardless of decorator order). */
export function MinIrrAmount(
  min: bigint,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'minIrrAmount',
      target: object.constructor,
      propertyName,
      constraints: [min],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [minValue] = args.constraints as [bigint];
          if (typeof value === 'bigint') return value >= minValue;
          if (typeof value === 'number') return BigInt(value) >= minValue;
          if (typeof value === 'string' && /^-?\d+$/.test(value)) {
            return BigInt(value) >= minValue;
          }
          return false;
        },
        defaultMessage(args?: ValidationArguments): string {
          const [minValue] = (args?.constraints ?? [0n]) as [bigint];
          return `مبلغ باید حداقل ${minValue.toString()} ریال باشد`;
        },
      },
    });
  };
}

/** Pairs with @IsIrrAmount() to convert the validated number/string into a
 * bigint before it reaches the service layer. Deliberately swallows a bad
 * shape (e.g. a float) instead of throwing here — @IsIrrAmount() rejects it
 * with a normal 400 instead of it surfacing as an unhandled 500. */
export function TransformToIrr() {
  return Transform(({ value }: { value: unknown }): unknown => {
    if (value === undefined || value === null) return value;
    try {
      return toIrr(value as bigint | number | string);
    } catch {
      return value;
    }
  });
}
