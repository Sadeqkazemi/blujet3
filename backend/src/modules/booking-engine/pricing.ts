import type { EntityManager } from 'typeorm';
import { CabinFare } from '../../database/entities/cabin-fare.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { Booking } from '../../database/entities/booking.entity';
import type { BookingChannel, CabinClass } from '../../database/enums';
import { type Irr, pctOfIrr, roundIrrTo } from '../../common/money';

/** Same documented flat fallback as reservation/pnr.service.ts — no
 * canonical public-site fare exists for a flight with neither a Phase 6
 * registered price nor a Phase 11 CabinFare row. */
const FALLBACK_ECONOMY_PRICE_IRR: Irr = 38_000_000n;
/** Business multiplier over the resolved economy price, as an integer
 * percent (180 = ×1.8) — a documented placeholder until commercial pricing
 * owns per-cabin fares directly. */
const BUSINESS_MULTIPLIER_PCT = 180;
const COMFORT_MULTIPLIER_PCT = 125;
const FIRST_MULTIPLIER_PCT = 250;

export function fallbackCabinPrice(economyPrice: Irr, cabin: CabinClass): Irr {
  const multiplier =
    cabin === 'FIRST'
      ? FIRST_MULTIPLIER_PCT
      : cabin === 'BUSINESS'
        ? BUSINESS_MULTIPLIER_PCT
        : cabin === 'COMFORT'
          ? COMFORT_MULTIPLIER_PCT
          : 100;
  return multiplier === 100
    ? economyPrice
    : roundIrrTo(pctOfIrr(economyPrice, multiplier), 100_000n);
}

/**
 * Pricing is separate from availability (CLAUDE.md) — the single source of
 * truth for what a cabin costs right now, used identically at search time
 * and at pre-payment re-price time so the two can never disagree.
 */
export async function getCabinPrice(
  manager: EntityManager,
  flightInstanceId: string,
  cabin: CabinClass,
  channel: BookingChannel = 'SYSTEM',
  excludeBookingId?: string,
): Promise<Irr> {
  const byClass = await resolveFareClass(
    manager,
    flightInstanceId,
    cabin,
    channel,
    excludeBookingId,
  );
  if (byClass) return byClass.priceIrr;

  const fare = await manager.findOneBy(CabinFare, { flightInstanceId, cabin });
  if (fare) return fare.priceIrr;

  const [instance, pricing] = await Promise.all([
    manager
      .createQueryBuilder(FlightInstance, 'fi')
      .where('fi.id = :flightInstanceId', { flightInstanceId })
      .getOne(),
    manager
      .createQueryBuilder(FarePricingProposal, 'p')
      .where('p.flightInstanceId = :flightInstanceId', { flightInstanceId })
      .getOne(),
  ]);
  const economyPrice: Irr =
    pricing?.status === 'REGISTERED'
      ? (pricing.registeredPriceIrr as Irr)
      : ((instance?.basePriceIrr as Irr | null) ?? FALLBACK_ECONOMY_PRICE_IRR);

  return fallbackCabinPrice(economyPrice, cabin);
}

/**
 * IATA-style fare-class buckets (Y/B/M …): when FareRule rows exist for an
 * instance+cabin, the bookable price is the CHEAPEST class that still has
 * allocation left. A class's consumption = active bookings stamped with its
 * classCode (EXPIRED/CANCELLED bookings release the bucket automatically).
 * Returns null when the instance has no fare-class rows (or none are
 * currently valid/channel-eligible — see below) — flat CabinFare / Phase 6
 * pricing applies then.
 *
 * Phase 13 Part B: a rule outside its validFrom/validUntil window "now", or
 * whose allowedChannels doesn't include the requesting channel (empty list
 * = all channels), is treated as if it didn't exist for this call — not
 * merely unavailable to buy, invisible to pricing entirely.
 */
export async function resolveFareClass(
  manager: EntityManager,
  flightInstanceId: string,
  cabin: CabinClass,
  channel: BookingChannel = 'SYSTEM',
  excludeBookingId?: string,
): Promise<{ classCode: string; priceIrr: Irr; taxIrr: Irr } | null> {
  const now = new Date();
  const allRules = await manager.find(FareRule, {
    where: { flightInstanceId, cabin },
  });
  const priceForChannel = (rule: FareRule): Irr =>
    channel === 'SYSTEM'
      ? (rule.sitePriceIrr ?? rule.priceIrr)
      : channel === 'AGENCY'
        ? (rule.agencyReleasePriceIrr ?? rule.priceIrr)
        : rule.priceIrr;
  const releasedForChannel = (rule: FareRule): number =>
    channel === 'SYSTEM'
      ? Math.max(0, rule.siteSeatsReleased)
      : channel === 'AGENCY'
        ? Math.max(0, rule.agencySeatsReleased)
        : Math.max(0, rule.seatsAllocated);
  const rules = allRules
    .filter(
      (r) =>
        releasedForChannel(r) > 0 &&
        (!r.validFrom || r.validFrom <= now) &&
        (!r.validUntil || r.validUntil >= now) &&
        ((r.allowedChannels ?? []).length === 0 ||
          (r.allowedChannels ?? []).includes(channel)),
    )
    .sort((a, b) =>
      priceForChannel(a) < priceForChannel(b)
        ? -1
        : priceForChannel(a) > priceForChannel(b)
          ? 1
          : 0,
    );
  if (rules.length === 0) return null;

  const usageQuery = manager
    .createQueryBuilder(Booking, 'b')
    .select('b.fareClassCode', 'fareClassCode')
    .addSelect('b.channel', 'channel')
    .addSelect(
      'SUM(CASE WHEN p."extraSeatCode" IS NULL THEN 1 ELSE 2 END)',
      'count',
    )
    .innerJoin(
      'passengers',
      'p',
      'p."bookingId" = b.id AND (p."seatCode" IS NOT NULL OR p."extraSeatCode" IS NOT NULL)',
    )
    .where('b.flightInstanceId = :flightInstanceId', { flightInstanceId })
    .andWhere('b.cabin = :cabin', { cabin })
    .andWhere('b.fareClassCode IS NOT NULL')
    .andWhere('b.status IN (:...statuses)', {
      statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
    })
    .andWhere('(b.status != :held OR b."holdExpiresAt" > :now)', {
      held: 'HELD',
      now,
    })
    .andWhere('b."deletedAt" IS NULL')
    .andWhere('p."deletedAt" IS NULL');
  // The current HELD booking already owns its seat. Counting it during
  // pre-payment re-pricing makes the final seat in a fare bucket appear
  // exhausted and incorrectly jumps that booking to the next rate.
  if (excludeBookingId) {
    usageQuery.andWhere('b.id != :excludeBookingId', { excludeBookingId });
  }
  const usageRows = await usageQuery
    .groupBy('b.fareClassCode')
    .addGroupBy('b.channel')
    .getRawMany<{
      fareClassCode: string;
      channel: BookingChannel;
      count: string;
    }>();
  const used = new Map(
    usageRows.map((u) => [`${u.channel}:${u.fareClassCode}`, Number(u.count)]),
  );
  const sharedUsed = new Map<string, number>();
  for (const row of usageRows) {
    sharedUsed.set(
      row.fareClassCode,
      (sharedUsed.get(row.fareClassCode) ?? 0) + Number(row.count),
    );
  }

  for (const rule of rules) {
    if (
      (used.get(`${channel}:${rule.classCode}`) ?? 0) <
        releasedForChannel(rule) &&
      (sharedUsed.get(rule.classCode) ?? 0) < rule.seatsAllocated
    ) {
      return {
        classCode: rule.classCode,
        priceIrr: priceForChannel(rule),
        taxIrr: rule.taxIrr,
      };
    }
  }
  // A programmed bucket is a hard channel quota. Once every bucket for the
  // requesting channel is consumed, pricing must not spill into the other
  // channel or silently keep selling at the final rate.
  return null;
}
