import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { Booking } from '../../database/entities/booking.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { CustomerIdentityVerification } from '../../database/entities/customer-identity-verification.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { Airport } from '../../database/entities/airport.entity';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { Role } from '../../database/enums';
import { ErrorCode } from '../../common/errors';
import { tryDecryptPii } from '../../common/pii-crypto';
import {
  normalizeIranPhone,
  toLatinDigits,
  toLocalIranMobile,
} from '../../common/normalize-iran-phone';
import { TEMPORARY_PANEL_USERNAME_PREFIX } from '../../database/temporary-panel-accounts';
import type { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import {
  assessProfileCompletion,
  maskIdentityValue,
  profileIncompleteSql,
} from '../../common/profile-completion';

function displayPhone(phone: string | null): string | null {
  if (!phone) return null;
  try {
    return toLocalIranMobile(phone);
  } catch {
    return phone;
  }
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ClubMember)
    private readonly clubRepo: Repository<ClubMember>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(CustomerIdentityVerification)
    private readonly identityRepo: Repository<CustomerIdentityVerification>,
    @InjectRepository(StoredFile)
    private readonly fileRepo: Repository<StoredFile>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
  ) {}

  private userBaseQb() {
    return (
      this.userRepo
        .createQueryBuilder('u')
        .where('u.role = :role', { role: Role.USER })
        .andWhere('u.deletedAt IS NULL')
        // UAT temporary identity/access accounts are infrastructure, never a
        // real customer — excluded from every list/count this service exposes.
        .andWhere("LOWER(COALESCE(u.username, '')) NOT LIKE :uatPrefix", {
          uatPrefix: `${TEMPORARY_PANEL_USERNAME_PREFIX}%`,
        })
    );
  }

  async list(query: ListCustomersQueryDto, maskSensitive = false) {
    const qb = this.userBaseQb().orderBy('u.createdAt', 'DESC');

    const rawQ = (query.q ?? '').trim();
    if (rawQ) {
      const digits = toLatinDigits(rawQ).replace(/\D/g, '');
      if (digits.length >= 2) {
        // Match stored E.164 (+989…) and local 09… forms by digit suffix.
        const e164 = normalizeIranPhone(
          digits.startsWith('0') ? digits : `0${digits}`,
        );
        const local = toLocalIranMobile(e164);
        qb.andWhere(
          `(regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') LIKE :digits
            OR u.phone = :e164
            OR u.phone = :local)`,
          {
            digits: `%${digits}%`,
            e164,
            local,
          },
        );
      }
    }

    const users = await qb.getMany();
    const incompleteCount = await this.countIncomplete();

    if (users.length === 0) {
      return { customers: [], incompleteCount, total: 0 };
    }

    const ids = users.map((u) => u.id);
    const clubs = await this.clubRepo
      .createQueryBuilder('c')
      .where('c.userId IN (:...ids)', { ids })
      .andWhere('c.deactivatedAt IS NULL')
      .getMany();
    const clubByUser = new Map(clubs.map((c) => [c.userId!, c]));

    const customers = users.map((u) => {
      const completion = assessProfileCompletion(u);
      const club = clubByUser.get(u.id);
      const rawNationalId = tryDecryptPii(u.nationalIdEnc);
      const nationalId = maskSensitive
        ? maskIdentityValue(rawNationalId)
        : rawNationalId;
      return {
        id: u.id,
        fullName: u.fullName?.trim() || '',
        phone: displayPhone(u.phone),
        email: u.email,
        nationalId,
        ...completion,
        createdAt: u.createdAt.toISOString(),
        club: club
          ? {
              isMember: true,
              level: club.level,
              points: club.points,
            }
          : { isMember: false, level: null, points: 0 },
      };
    });

    return {
      customers,
      incompleteCount,
      total: customers.length,
    };
  }

  async incompleteCount() {
    return this.countIncomplete();
  }

  private async countIncomplete(): Promise<number> {
    return this.userBaseQb().andWhere(profileIncompleteSql('u')).getCount();
  }

  async getById(id: string, maskSensitive = false) {
    const user = await this.userRepo.findOne({
      where: { id, role: Role.USER, deletedAt: IsNull() },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مشتری یافت نشد.',
      });
    }

    const completion = assessProfileCompletion(user);
    const rawNationalId = tryDecryptPii(user.nationalIdEnc);
    const nationalId = maskSensitive
      ? maskIdentityValue(rawNationalId)
      : rawNationalId;

    const club = await this.clubRepo.findOne({
      where: { userId: user.id, deactivatedAt: IsNull() },
    });

    const identity = await this.identityRepo.findOne({
      where: { userId: user.id },
    });
    const docs: Array<{
      type: string;
      file: string;
      status: 'verified' | 'pending' | 'rejected';
    }> = [];
    if (identity?.idCardFileId) {
      const file = await this.fileRepo.findOne({
        where: { id: identity.idCardFileId },
      });
      const status =
        identity.status === 'APPROVED'
          ? 'verified'
          : identity.status === 'REJECTED'
            ? 'rejected'
            : 'pending';
      docs.push({
        type: 'کارت ملی',
        file: file?.fileName ?? 'id-card',
        status,
      });
    }

    const bookings = await this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.flightInstance', 'fi')
      .leftJoinAndSelect('fi.flight', 'f')
      .leftJoinAndSelect('f.route', 'r')
      .where('b.userId = :userId', { userId: user.id })
      .andWhere('b.deletedAt IS NULL')
      .orderBy('b.createdAt', 'DESC')
      .take(50)
      .getMany();

    const codes = new Set<string>();
    for (const b of bookings) {
      const origin = b.flightInstance?.flight?.route?.originCode;
      const dest = b.flightInstance?.flight?.route?.destCode;
      if (origin) codes.add(origin);
      if (dest) codes.add(dest);
    }
    const airports =
      codes.size > 0
        ? await this.airportRepo
            .createQueryBuilder('a')
            .where('a.code IN (:...codes)', { codes: [...codes] })
            .getMany()
        : [];
    const cityByCode = new Map(airports.map((a) => [a.code, a.cityFa]));

    const purchases = bookings.map((b) => {
      const route = b.flightInstance?.flight?.route;
      const origin =
        (route && cityByCode.get(route.originCode)) ?? route?.originCode ?? '—';
      const dest =
        (route && cityByCode.get(route.destCode)) ?? route?.destCode ?? '—';
      const dep = b.flightInstance?.departureAt ?? b.createdAt;
      return {
        id: b.id,
        route: `${origin} ← ${dest}`,
        pnr: b.pnr,
        date: dep.toISOString(),
        priceIrr: b.priceIrr.toString(),
        status: b.status,
      };
    });

    const phoneNorm = user.phone ? normalizeIranPhone(user.phone) : null;
    const ticketsQb = this.ticketRepo
      .createQueryBuilder('t')
      .where(
        phoneNorm
          ? '(t.userId = :userId OR (t.userId IS NULL AND t.requesterPhone = :phone))'
          : 't.userId = :userId',
        phoneNorm ? { userId: user.id, phone: phoneNorm } : { userId: user.id },
      );
    const tickets = await ticketsQb
      .orderBy('t.createdAt', 'DESC')
      .take(50)
      .getMany();

    const contacts = tickets.map((t) => ({
      id: t.id,
      channel: 'تیکت',
      subject: t.subject,
      date: t.createdAt.toISOString(),
      status: t.status,
    }));

    const refundRows = await this.refundRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.booking', 'b')
      .leftJoinAndSelect('b.flightInstance', 'fi')
      .leftJoinAndSelect('fi.flight', 'f')
      .leftJoinAndSelect('f.route', 'route')
      .where('b.userId = :userId', { userId: user.id })
      .andWhere('b.deletedAt IS NULL')
      .orderBy('r.createdAt', 'DESC')
      .take(50)
      .getMany();

    const refundCodes = new Set<string>();
    for (const r of refundRows) {
      const origin = r.booking?.flightInstance?.flight?.route?.originCode;
      const dest = r.booking?.flightInstance?.flight?.route?.destCode;
      if (origin) refundCodes.add(origin);
      if (dest) refundCodes.add(dest);
    }
    const refundAirports =
      refundCodes.size > 0
        ? await this.airportRepo
            .createQueryBuilder('a')
            .where('a.code IN (:...codes)', { codes: [...refundCodes] })
            .getMany()
        : [];
    const refundCity = new Map(refundAirports.map((a) => [a.code, a.cityFa]));

    const refunds = refundRows.map((r) => {
      const route = r.booking?.flightInstance?.flight?.route;
      const origin =
        (route && refundCity.get(route.originCode)) ?? route?.originCode ?? '—';
      const dest =
        (route && refundCity.get(route.destCode)) ?? route?.destCode ?? '—';
      return {
        id: r.id,
        trackingCode: r.trackingCode,
        passengerName: r.passengerName,
        route: `${origin} ← ${dest}`,
        pnr: r.booking?.pnr ?? '—',
        status: r.status,
        totalPaidIrr: r.totalPaidIrr.toString(),
        penaltyPct: r.penaltyPct,
        penaltyAmountIrr: r.penaltyAmountIrr.toString(),
        refundableIrr: r.refundableIrr.toString(),
        createdAt: r.createdAt.toISOString(),
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      };
    });

    return {
      id: user.id,
      fullName: user.fullName?.trim() || '',
      phone: displayPhone(user.phone),
      email: user.email,
      nationalId,
      ...completion,
      registeredAt: user.createdAt.toISOString(),
      club: club
        ? {
            isMember: true,
            level: club.level,
            points: club.points,
            cardStatus: club.cardStatus,
            cardNo: club.cardNo,
          }
        : {
            isMember: false,
            level: null,
            points: 0,
            cardStatus: null,
            cardNo: null,
          },
      docs,
      purchases,
      contacts,
      refunds,
    };
  }
}
