import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsumeEventDto } from './dto/consume-event.dto';
import { EventsService } from './events.service';

@ApiTags('internal-events')
@Controller('internal/v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'مصرف idempotent رخداد رمز‌شده outbox' })
  async consume(@Body() event: ConsumeEventDto) {
    return { success: true, data: await this.events.consume(event) };
  }
}
