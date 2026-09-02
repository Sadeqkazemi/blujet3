import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { TwoFactorChallenge } from '../../database/entities/two-factor-challenge.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { CustomerIdentityVerification } from '../../database/entities/customer-identity-verification.entity';
import { SavedPassenger } from '../../database/entities/saved-passenger.entity';
import { SavedBankAccount } from '../../database/entities/saved-bank-account.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { SavedPassengersService } from './saved-passengers.service';
import { MySavedPassengersController } from './my-saved-passengers.controller';
import { BankAccountsService } from './bank-accounts.service';
import { MyBankAccountsController } from './my-bank-accounts.controller';
import { IdentityVerificationService } from './identity-verification.service';
import { MyIdentityController } from './my-identity.controller';
import { IdentityAdminController } from './identity-admin.controller';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TwoFactorChallenge,
      StoredFile,
      CustomerIdentityVerification,
      SavedPassenger,
      SavedBankAccount,
    ]),
    AuthModule,
    FilesModule,
    AuditModule,
    PanelsModule,
  ],
  controllers: [
    ProfileController,
    MySavedPassengersController,
    MyBankAccountsController,
    MyIdentityController,
    IdentityAdminController,
  ],
  providers: [
    ProfileService,
    SavedPassengersService,
    BankAccountsService,
    IdentityVerificationService,
  ],
})
export class ProfileModule {}
