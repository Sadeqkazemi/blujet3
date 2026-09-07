import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { ErrorCode } from '../../common/errors';
import { CoreItineraryQuoteService } from './core-itinerary-quote.service';
import type {
  CoreOfferDto,
  CoreOfferRepriceDto,
  CoreOfferRepriceResultDto,
  CoreOfferSearchDto,
  CoreOfferSellerDto,
} from './dto/core-offer.dto';

const DEFAULT_TTL_SECONDS = 900;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 900;
const TOKEN_VERSION = 1;
const MAX_TOKEN_LENGTH = 4096;

type OfferTokenPayload = {
  v: 1;
  offerId: string;
  sellerType: CoreOfferSellerDto['type'];
  sellerId: string;
  expiresAtMs: number;
  requestDigest: string;
  totalIrr: string;
};

@Injectable()
export class CoreOfferService {
  constructor(
    private readonly quotes: CoreItineraryQuoteService,
    private readonly config: ConfigService,
  ) {}

  async search(dto: CoreOfferSearchDto): Promise<CoreOfferDto> {
    const signingSecret = this.signingSecret();
    const ttlSeconds = this.ttlSeconds();
    this.assertSellerChannel(dto);
    const quote = await this.quotes.quote(dto);
    const offerId = randomUUID();
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    const payload: OfferTokenPayload = {
      v: TOKEN_VERSION,
      offerId,
      sellerType: dto.seller.type,
      sellerId: dto.seller.id,
      expiresAtMs,
      requestDigest: this.requestDigest(dto),
      totalIrr: quote.totalIrr,
    };
    return {
      offerId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      seller: dto.seller,
      quote,
      integrityToken: this.encode(payload, signingSecret),
    };
  }

  async reprice(
    offerId: string,
    dto: CoreOfferRepriceDto,
  ): Promise<CoreOfferRepriceResultDto> {
    this.assertSellerChannel(dto);
    const payload = this.decode(dto.integrityToken);
    if (payload.offerId !== offerId) this.invalidOffer();
    if (
      payload.sellerType !== dto.seller.type ||
      payload.sellerId !== dto.seller.id ||
      payload.requestDigest !== this.requestDigest(dto)
    ) {
      this.invalidOffer();
    }
    if (payload.expiresAtMs <= Date.now()) {
      throw new ConflictException({
        code: ErrorCode.OFFER_EXPIRED,
        message: 'پیشنهاد منقضی شده است و باید دوباره قیمت‌گذاری شود.',
      });
    }
    const quote = await this.quotes.quote(dto);
    return {
      quote,
      previousTotalIrr: payload.totalIrr,
      currentTotalIrr: quote.totalIrr,
      priceChanged: payload.totalIrr !== quote.totalIrr,
      repricedAt: new Date().toISOString(),
    };
  }

  private assertSellerChannel(dto: CoreOfferSearchDto): void {
    const expected = dto.channel === 'AGENCY' ? 'AGENCY' : 'USER';
    if (dto.seller.type !== expected) this.invalidOffer();
  }

  private requestDigest(dto: CoreOfferSearchDto): string {
    const request = {
      channel: dto.channel,
      seller: dto.seller,
      segments: dto.segments,
      travellers: dto.travellers,
    };
    return createHash('sha256')
      .update(this.canonicalize(request), 'utf8')
      .digest('hex');
  }

  private encode(payload: OfferTokenPayload, signingSecret: string): string {
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      'utf8',
    ).toString('base64url');
    const signature = createHmac('sha256', signingSecret)
      .update(encodedPayload, 'utf8')
      .digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private decode(token: string): OfferTokenPayload {
    if (token.length > MAX_TOKEN_LENGTH) this.invalidOffer();
    const secret = this.signingSecret();
    const [encodedPayload, encodedSignature, ...rest] = token.split('.');
    if (!encodedPayload || !encodedSignature || rest.length > 0) {
      this.invalidOffer();
    }
    let suppliedSignature: Buffer;
    let payload: unknown;
    try {
      suppliedSignature = Buffer.from(encodedSignature, 'base64url');
      const expectedSignature = createHmac('sha256', secret)
        .update(encodedPayload, 'utf8')
        .digest();
      if (
        suppliedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(suppliedSignature, expectedSignature)
      ) {
        this.invalidOffer();
      }
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as unknown;
    } catch {
      this.invalidOffer();
    }
    if (!this.isTokenPayload(payload)) this.invalidOffer();
    return payload;
  }

  private isTokenPayload(value: unknown): value is OfferTokenPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const candidate = value as Record<string, unknown>;
    return (
      candidate.v === TOKEN_VERSION &&
      typeof candidate.offerId === 'string' &&
      (candidate.sellerType === 'USER' || candidate.sellerType === 'AGENCY') &&
      typeof candidate.sellerId === 'string' &&
      Number.isInteger(candidate.expiresAtMs) &&
      typeof candidate.requestDigest === 'string' &&
      /^[a-f0-9]{64}$/.test(candidate.requestDigest) &&
      typeof candidate.totalIrr === 'string' &&
      /^\d+$/.test(candidate.totalIrr)
    );
  }

  private canonicalize(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalize(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
      const object = value as Record<string, unknown>;
      return `{${Object.keys(object)
        .filter((key) => object[key] !== undefined)
        .sort()
        .map(
          (key) => `${JSON.stringify(key)}:${this.canonicalize(object[key])}`,
        )
        .join(',')}}`;
    }
    this.invalidOffer();
  }

  private signingSecret(): string {
    const secret = this.config.get<string>('CORE_OFFER_SIGNING_SECRET');
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException({
        code: ErrorCode.OFFER_UNAVAILABLE,
        message: 'سرویس پیشنهاد قیمت برای این محیط پیکربندی نشده است.',
      });
    }
    return secret;
  }

  private ttlSeconds(): number {
    const raw = this.config.get<string>('CORE_OFFER_TTL_SECONDS');
    const value = raw === undefined ? DEFAULT_TTL_SECONDS : Number(raw);
    if (
      !Number.isInteger(value) ||
      value < MIN_TTL_SECONDS ||
      value > MAX_TTL_SECONDS
    ) {
      throw new ServiceUnavailableException({
        code: ErrorCode.OFFER_UNAVAILABLE,
        message: 'مدت اعتبار پیشنهاد قیمت در محیط معتبر نیست.',
      });
    }
    return value;
  }

  private invalidOffer(): never {
    throw new ConflictException({
      code: ErrorCode.OFFER_INVALID,
      message: 'پیشنهاد قیمت معتبر نیست و باید دوباره دریافت شود.',
    });
  }
}
