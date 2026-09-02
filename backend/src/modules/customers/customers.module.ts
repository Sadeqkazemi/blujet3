import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { Booking } from '../../database/entities/booking.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { CustomerIdentityVerification } from '../../database/entities/customer-identity-verification.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { Airport } from '../../database/entities/airport.entity';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ClubMember,
      Booking,
      SupportTicket,
      CustomerIdentityVerification,
      StoredFile,
      Airport,
      RefundRequest,
    ]),
    PanelsModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
