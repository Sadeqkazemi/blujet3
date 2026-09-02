import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Airport } from '../../database/entities/airport.entity';
import { ErrorCode } from '../../common/errors';
import { resolveAircraftType } from '../flights/aircraft-type.util';

const STATUS_LABEL_FA: Record<string, string> = {
  SCHEDULED: 'برنامه‌ریزی‌شده',
  CANCELLED: 'لغو شد',
};

@Injectable()
export class FlightStatusService {
  constructor(
    @InjectRepository(FlightInstance)
    private readonly instanceRepo: Repository<FlightInstance>,
    @InjectRepository(Airport)
    private readonly airportRepo: Repository<Airport>,
  ) {}

  async lookup(params: {
    flightNo?: string;
    origin?: string;
    dest?: string;
    date: string;
  }) {
    if (!params.flightNo && !(params.origin && params.dest)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شماره پرواز یا مبدأ و مقصد لازم است.',
      });
    }

    const dayStart = new Date(params.date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const qb = this.instanceRepo
      .createQueryBuilder('instance')
      .innerJoinAndSelect('instance.flight', 'flight')
      .innerJoinAndSelect('flight.route', 'route')
      .where(
        'instance.departureAt >= :dayStart AND instance.departureAt < :dayEnd',
        {
          dayStart,
          dayEnd,
        },
      )
      .orderBy('instance.departureAt', 'ASC');

    if (params.flightNo) {
      qb.andWhere('flight."flightNo" ILIKE :flightNo', {
        flightNo: params.flightNo,
      });
    } else {
      qb.andWhere('route."originCode" ILIKE :origin', {
        origin: params.origin,
      }).andWhere('route."destCode" ILIKE :dest', { dest: params.dest });
    }

    const instance = await qb.getOne();

    if (!instance) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پروازی یافت نشد.',
      });
    }

    const [originAirport, destAirport] = await Promise.all([
      this.airportRepo.findOne({
        where: { code: instance.flight.route.originCode },
      }),
      this.airportRepo.findOne({
        where: { code: instance.flight.route.destCode },
      }),
    ]);

    const now = new Date();
    const statusLabelFa =
      instance.status === 'DEPARTED'
        ? instance.arrivalAt <= now
          ? 'فرود آمد'
          : 'در حال پرواز'
        : (STATUS_LABEL_FA[instance.status] ?? instance.status);

    return {
      flightInstanceId: instance.id,
      flightNo: instance.flight.flightNo,
      aircraftType: resolveAircraftType(instance),
      originCode: instance.flight.route.originCode,
      originCityFa: originAirport?.cityFa ?? instance.flight.route.originCode,
      destCode: instance.flight.route.destCode,
      destCityFa: destAirport?.cityFa ?? instance.flight.route.destCode,
      departureAt: instance.departureAt,
      arrivalAt: instance.arrivalAt,
      status: instance.status,
      statusLabelFa,
    };
  }
}
