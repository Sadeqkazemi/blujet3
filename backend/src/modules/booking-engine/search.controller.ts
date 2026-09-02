import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SearchService } from './search.service';
import { SearchAdvisoryService } from './search-advisory.service';
import { SearchFlightsDto } from './dto/search-flights.dto';
import { SearchAdvisoryDto } from './dto/search-advisory.dto';
import { SearchPriceCalendarDto } from './dto/search-price-calendar.dto';
import { CabinClass } from '../../database/enums';

/** Fully public — no login required to browse flights, matching every
 * airline site's golden path (login only becomes necessary at booking). */
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly searchAdvisory: SearchAdvisoryService,
  ) {}

  @Get('airports')
  @ApiOperation({ summary: 'فهرست فرودگاه‌ها برای جعبه جستجو' })
  async airports() {
    return { success: true, data: await this.search.airports() };
  }

  @Get('cabins')
  @ApiOperation({
    summary: 'کابین‌های فعال برای جعبه‌های جستجوی عمومی و آژانس',
  })
  async cabins() {
    return { success: true, data: await this.search.cabins() };
  }

  @Get('flights')
  @ApiOperation({ summary: 'جستجوی پرواز بین دو فرودگاه در یک روز مشخص' })
  async flights(@Query() query: SearchFlightsDto) {
    const data = await this.search.search(
      query.origin,
      query.dest,
      query.date,
      query.cabin ?? CabinClass.ECONOMY,
    );
    return { success: true, data };
  }

  @Get('flights/:id/seatmap')
  @ApiOperation({ summary: 'نقشه صندلی برای انتخاب صندلی هنگام خرید' })
  async seatMap(@Param('id') id: string) {
    return { success: true, data: await this.search.seatMap(id) };
  }

  @Get('price-calendar')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'تقویم قیمت ۷روزه برای نوار نتایج پرواز' })
  async priceCalendar(@Query() query: SearchPriceCalendarDto) {
    const data = await this.search.priceCalendar(
      query.origin,
      query.dest,
      query.date,
      3,
      query.cabin ?? CabinClass.ECONOMY,
    );
    return { success: true, data };
  }

  @Get('advisory')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'رادار هوشمند قیمت — توصیه خرید/انتظار (advisory، degrade امن)',
  })
  async getAdvisory(@Query() query: SearchAdvisoryDto, @Req() req: Request) {
    const requestId = req.headers['x-request-id'];
    const data = await this.searchAdvisory.advise(
      query.origin,
      query.dest,
      query.date,
      query.cabin ?? CabinClass.ECONOMY,
      typeof requestId === 'string' ? requestId : undefined,
    );
    return { success: true, data };
  }
}
