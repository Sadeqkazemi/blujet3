import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SavedFlight } from '../../database/entities/saved-flight.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Airport } from '../../database/entities/airport.entity';
import { ErrorCode } from '../../common/errors';
import { getCabinPrice } from './pricing';
import { ZERO_IRR, isPositiveIrr } from '../../common/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CabinClass } from '../../database/enums';
import {
  assertSellableForSale,
  isSellableDefinitionStatus,
} from '../flights/definition-sellability';

const MAX_SAVED = 20;

@Injectable()
export class SavedFlightsService {
  constructor(
    @InjectRepository(SavedFlight)
    private readonly savedFlightRepo: Repository<SavedFlight>,
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
  ) {}

  async listMine(user: AuthenticatedUser) {
    const rows = await this.savedFlightRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.flightInstance', 'flightInstance')
      .leftJoinAndSelect('flightInstance.flight', 'flight')
      .leftJoinAndSelect('flight.route', 'route')
      .where('s.userId = :userId', { userId: user.id })
      .orderBy('s.createdAt', 'DESC')
      .getMany();

    const airportCodes = new Set<string>();
    for (const row of rows) {
      airportCodes.add(row.flightInstance.flight.route.originCode);
      airportCodes.add(row.flightInstance.flight.route.destCode);
    }
    const airports = airportCodes.size
      ? await this.airportRepo.find({
          where: { code: In([...airportCodes]) },
        })
      : [];
    const cityByCode = new Map(airports.map((a) => [a.code, a.cityFa]));

    const now = new Date();
    return Promise.all(
      rows.map(async (row) => {
        const inst = row.flightInstance;
        const originCode = inst.flight.route.originCode;
        const destCode = inst.flight.route.destCode;
        let priceIrr = ZERO_IRR;
        let bookable = false;
        if (
          inst.status === 'SCHEDULED' &&
          inst.departureAt > now &&
          isSellableDefinitionStatus(
            inst.definitionStatus,
            inst.approvedSnapshot != null,
          )
        ) {
          try {
            priceIrr = await getCabinPrice(
              this.savedFlightRepo.manager,
              row.flightInstanceId,
              row.cabin,
            );
            bookable = isPositiveIrr(priceIrr);
          } catch {
            bookable = false;
          }
        }

        return {
          id: row.id,
          flightInstanceId: row.flightInstanceId,
          cabin: row.cabin,
          flightNo: inst.flight.flightNo,
          originCode,
          destCode,
          originCityFa: cityByCode.get(originCode) ?? originCode,
          destCityFa: cityByCode.get(destCode) ?? destCode,
          departureAt: inst.departureAt,
          arrivalAt: inst.arrivalAt,
          priceIrr,
          bookable,
          createdAt: row.createdAt,
        };
      }),
    );
  }

  async save(
    user: AuthenticatedUser,
    dto: { flightInstanceId: string; cabin: CabinClass },
  ) {
    const instance = await this.flightInstanceRepo
      .createQueryBuilder('fi')
      .where('fi.id = :id', { id: dto.flightInstanceId })
      .getOne();
    if (!instance || instance.status !== 'SCHEDULED') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد یا دیگر قابل ذخیره نیست.',
      });
    }
    assertSellableForSale(instance);
    if (instance.departureAt <= new Date()) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز یافت نشد یا دیگر قابل ذخیره نیست.',
      });
    }

    await getCabinPrice(
      this.savedFlightRepo.manager,
      dto.flightInstanceId,
      dto.cabin,
    );

    const count = await this.savedFlightRepo.count({
      where: { userId: user.id },
    });
    if (count >= MAX_SAVED) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: `حداکثر ${MAX_SAVED} پرواز را می‌توانید ذخیره کنید.`,
      });
    }

    const existing = await this.savedFlightRepo.findOneBy({
      userId: user.id,
      flightInstanceId: dto.flightInstanceId,
      cabin: dto.cabin,
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این پرواز قبلاً ذخیره شده است.',
      });
    }

    return this.savedFlightRepo.save(
      this.savedFlightRepo.create({
        userId: user.id,
        flightInstanceId: dto.flightInstanceId,
        cabin: dto.cabin,
      }),
    );
  }

  async remove(user: AuthenticatedUser, id: string) {
    const row = await this.savedFlightRepo.findOneBy({ id });
    if (!row || row.userId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پرواز ذخیره‌شده یافت نشد.',
      });
    }
    await this.savedFlightRepo.delete({ id });
    return { removed: true };
  }
}
