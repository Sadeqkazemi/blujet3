import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/errors';
import type {
  CoreOfferDto,
  CoreOfferRepriceDto,
  CoreOfferRepriceResultDto,
  CoreOfferSearchDto,
} from './dto/core-offer.dto';
import type { OfferPricingClient } from './offer-pricing-client.interface';

type OfferEnvelope = { success: true; data: Record<string, unknown> };

@Injectable()
export class HttpOfferPricingClient implements OfferPricingClient {
  constructor(private readonly config: ConfigService) {}

  search(dto: CoreOfferSearchDto): Promise<CoreOfferDto> {
    return this.post(
      '/internal/v1/offers/search',
      dto,
      (data) =>
        typeof data.offerId === 'string' &&
        typeof data.integrityToken === 'string' &&
        typeof data.expiresAt === 'string' &&
        Boolean(data.quote) &&
        typeof data.quote === 'object',
    );
  }

  reprice(
    offerId: string,
    dto: CoreOfferRepriceDto,
  ): Promise<CoreOfferRepriceResultDto> {
    return this.post(
      `/internal/v1/offers/${encodeURIComponent(offerId)}/reprice`,
      dto,
      (data) =>
        typeof data.previousTotalIrr === 'string' &&
        typeof data.currentTotalIrr === 'string' &&
        typeof data.priceChanged === 'boolean' &&
        typeof data.repricedAt === 'string' &&
        Boolean(data.quote) &&
        typeof data.quote === 'object',
    );
  }

  private async post<T extends object>(
    path: string,
    body: object,
    validate: (data: Record<string, unknown>) => boolean,
  ): Promise<T> {
    const baseUrl = this.required('OFFER_SERVICE_URL').replace(/\/$/, '');
    const token = this.required('OFFER_INTERNAL_TOKEN');
    const timeout = this.timeoutMs();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        throw new HttpException(
          this.errorPayload(payload),
          response.status >= 400 && response.status <= 599
            ? response.status
            : 503,
        );
      }
      if (!this.isEnvelope(payload) || !validate(payload.data)) {
        return this.unavailable();
      }
      return payload.data as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return this.unavailable();
    }
  }

  private required(key: 'OFFER_SERVICE_URL' | 'OFFER_INTERNAL_TOKEN'): string {
    const value = this.config.get<string>(key);
    if (!value) return this.unavailable();
    return value;
  }

  private timeoutMs(): number {
    const raw = Number(
      this.config.get<string>('OFFER_REQUEST_TIMEOUT_MS') ?? '3000',
    );
    if (!Number.isInteger(raw) || raw < 100 || raw > 30_000) {
      return this.unavailable();
    }
    return raw;
  }

  private isEnvelope(value: unknown): value is OfferEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const envelope = value as Record<string, unknown>;
    if (
      envelope.success !== true ||
      !envelope.data ||
      typeof envelope.data !== 'object'
    )
      return false;
    return true;
  }

  private errorPayload(value: unknown): object {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const envelope = value as Record<string, unknown>;
      const candidate =
        envelope.error &&
        typeof envelope.error === 'object' &&
        !Array.isArray(envelope.error)
          ? (envelope.error as Record<string, unknown>)
          : envelope;
      if (
        typeof candidate.code === 'string' &&
        typeof candidate.message === 'string'
      ) {
        return { code: candidate.code, message: candidate.message };
      }
    }
    return {
      code: ErrorCode.OFFER_UNAVAILABLE,
      message: 'سرویس پیشنهاد قیمت پاسخ معتبر نداد.',
    };
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: ErrorCode.OFFER_UNAVAILABLE,
      message: 'سرویس پیشنهاد قیمت در دسترس نیست.',
    });
  }
}
