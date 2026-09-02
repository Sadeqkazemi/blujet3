import type { DataSource, Repository } from 'typeorm';
import type { SmsService } from '../sms/sms.service';
import { SurveyInvite } from '../../database/entities/survey-invite.entity';
import { SurveySettings } from '../../database/entities/survey-settings.entity';
import { Booking } from '../../database/entities/booking.entity';
import { BookingStatus } from '../../database/enums';
import { materializeFlownBookings } from '../flights/flight-lifecycle.util';

function surveyInviteLink(token: string): string {
  return `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/survey/${token}`;
}

async function sendInviteSms(
  inviteRepo: Repository<SurveyInvite>,
  sms: SmsService,
  inviteId: string,
  contactPhone: string | null,
  token: string,
): Promise<void> {
  const result = await sms.send(
    contactPhone,
    `سفر خوبی داشتید؟ لطفاً نظر خود را با ما در میان بگذارید: ${surveyInviteLink(token)}`,
    'SURVEY_INVITE',
  );
  if (result.success) {
    await inviteRepo.update(inviteId, { smsSentAt: new Date() });
  }
}

/**
 * Lazily creates a SurveyInvite for every booking that has reached FLOWN
 * but has none yet, and retries the SMS for any existing invite whose
 * first send attempt failed (`smsSentAt` still null) — no cron job, same
 * "materialize on read" principle as
 * materializeDepartedInstances/materializeFlownBookings. Called from
 * SurveyService's own read endpoints (config stats + exec results),
 * which are the natural, frequently-polled places this data is consumed
 * — rather than reaching into the three unrelated existing services that
 * already call materializeFlownBookings for their own purposes. See
 * docs/DB_SCHEMA.md's Phase 66 section.
 */
export async function materializeSurveyInvites(
  dataSource: DataSource,
  bookingRepo: Repository<Booking>,
  inviteRepo: Repository<SurveyInvite>,
  settingsRepo: Repository<SurveySettings>,
  sms: SmsService,
): Promise<void> {
  await materializeFlownBookings(dataSource);

  const settings = await settingsRepo.findOne({
    where: {},
    order: { createdAt: 'ASC' },
  });
  if (!settings || !settings.enabled) return;

  // Booking has no inverse relation to SurveyInvite (recurring shape across
  // this codebase) — a LEFT JOIN + IS NULL filter replaces Prisma's
  // relation-null `surveyInvite: null` where clause.
  const pending = await bookingRepo
    .createQueryBuilder('b')
    .leftJoin(SurveyInvite, 'si', 'si."bookingId" = b.id')
    .select(['b.id', 'b.flightInstanceId', 'b.contactPhone'])
    .where('b.status = :status', { status: BookingStatus.FLOWN })
    .andWhere('si.id IS NULL')
    .getMany();

  for (const booking of pending) {
    // One booking at a time, each in its own try/catch — a single SMS or
    // DB hiccup must never block the rest (same best-effort posture as
    // every other lazy-materialization step in this codebase).
    try {
      const invite = await inviteRepo.save(
        inviteRepo.create({
          bookingId: booking.id,
          flightInstanceId: booking.flightInstanceId,
        }),
      );
      await sendInviteSms(
        inviteRepo,
        sms,
        invite.id,
        booking.contactPhone,
        invite.token,
      );
    } catch {
      // best-effort — the next materialize() call (next read) retries any
      // booking that still has no SurveyInvite row.
    }
  }

  // Invites whose row exists but whose first SMS attempt failed (or was
  // never confirmed) — the `pending` query above can never find these
  // again since the booking now has a SurveyInvite, so without this pass
  // a transient SMS failure would silently strand the passenger forever.
  // Scoped to bookings that actually have a phone — a booking with none
  // is permanently undeliverable (see `sendInviteSms`/`SmsService.send`),
  // so retrying it every materialize() call would just pile up FAILED
  // SmsLog rows for a case that can never succeed.
  const unsent = await inviteRepo
    .createQueryBuilder('si')
    .leftJoinAndSelect('si.booking', 'booking')
    .where('si."smsSentAt" IS NULL')
    .andWhere('booking."contactPhone" IS NOT NULL')
    .getMany();
  for (const invite of unsent) {
    try {
      await sendInviteSms(
        inviteRepo,
        sms,
        invite.id,
        invite.booking.contactPhone,
        invite.token,
      );
    } catch {
      // best-effort — retried again on the next materialize() call.
    }
  }
}
