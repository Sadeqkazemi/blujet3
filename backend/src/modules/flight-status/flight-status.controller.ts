import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FlightStatusService } from './flight-status.service';
import { FlightStatusQueryDto } from './dto/flight-status-query.dto';

/** وضعیت پرواز — public, read-only. See docs/API.md's Phase 22 section
 * for why gate/baggage-belt/delay/terminal are NOT part of the response
 * (no such operational data model exists in this codebase). */
@ApiTags('flight-status')
@Controller('flight-status')
export class FlightStatusController {
  constructor(private readonly flightStatus: FlightStatusService) {}

  @Get()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'جستجوی وضعیت پرواز با شماره پرواز یا مبدأ/مقصد' })
  async lookup(@Query() query: FlightStatusQueryDto) {
    const data = await this.flightStatus.lookup(query);
    return { success: true, data };
  }
}
