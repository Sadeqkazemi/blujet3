import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { TwoFactorChallenge } from '../../database/entities/two-factor-challenge.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MySessionsController } from './my-sessions.controller';
import { MySessionsService } from './my-sessions.service';
import { StepUpService } from './step-up.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TWO_FACTOR_PROVIDER } from './providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from './providers/mock-two-factor.provider';
import { CustomerReferralsModule } from '../customer-referrals/customer-referrals.module';
import { AuditModule } from '../audit/audit.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TwoFactorChallenge,
      RefreshToken,
      AgencyProfile,
    ]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
    AuditModule,
    SmsModule,
    CustomerReferralsModule,
  ],
  controllers: [AuthController, MySessionsController],
  providers: [
    AuthService,
    MySessionsService,
    StepUpService,
    JwtStrategy,
    { provide: TWO_FACTOR_PROVIDER, useClass: MockTwoFactorProvider },
  ],
  exports: [AuthService, StepUpService, TWO_FACTOR_PROVIDER],
})
export class AuthModule {}
