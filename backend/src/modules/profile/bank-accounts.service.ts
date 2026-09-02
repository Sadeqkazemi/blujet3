import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedBankAccount } from '../../database/entities/saved-bank-account.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { ErrorCode } from '../../common/errors';
import { encryptPii, decryptPii, hashPii } from '../../common/pii-crypto';
import {
  guessBankFromPan,
  isValidSheba,
  maskCardPan,
  maskSheba,
  normalizeCardPan,
  normalizeSheba,
} from '../../common/iban.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dtos';

const MAX_ACCOUNTS = 5;

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(SavedBankAccount)
    private readonly bankAccountRepo: Repository<SavedBankAccount>,
  ) {}

  private shape(row: SavedBankAccount) {
    const sheba = decryptPii(row.shebaEnc);
    const pan = row.cardPanEnc ? decryptPii(row.cardPanEnc) : '';
    return {
      id: row.id,
      bankName: row.bankName,
      bankShort: row.bankShort,
      brandColor: row.brandColor,
      cardMasked: pan ? maskCardPan(pan) : null,
      sheba,
      shebaMasked: maskSheba(sheba),
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listMine(user: AuthenticatedUser) {
    const rows = await this.bankAccountRepo.find({
      where: { userId: user.id },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.shape(row));
  }

  async create(user: AuthenticatedUser, dto: CreateBankAccountDto) {
    const pan = normalizeCardPan(dto.cardNo);
    if (pan.length !== 16) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شماره کارت باید ۱۶ رقم باشد.',
      });
    }
    const sheba = normalizeSheba(dto.sheba);
    if (!isValidSheba(sheba)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'شماره شبا نامعتبر است.',
      });
    }

    const count = await this.bankAccountRepo.count({
      where: { userId: user.id },
    });
    if (count >= MAX_ACCOUNTS) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: `حداکثر ${MAX_ACCOUNTS} حساب بانکی می‌توانید ثبت کنید.`,
      });
    }

    const existing = await this.bankAccountRepo.findOneBy({
      userId: user.id,
      shebaHash: hashPii(sheba),
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این شبا قبلاً ثبت شده است.',
      });
    }

    const guessed = guessBankFromPan(pan);
    const bankName = dto.bankName?.trim() || guessed.bankName;
    const isFirst = count === 0;

    return this.bankAccountRepo.manager.transaction(async (tx) => {
      if (isFirst) {
        await tx.update(
          SavedBankAccount,
          { userId: user.id, isDefault: true },
          { isDefault: false },
        );
      }
      const row = await tx.save(
        tx.create(SavedBankAccount, {
          userId: user.id,
          bankName,
          bankShort: guessed.bankShort,
          brandColor: guessed.brandColor,
          cardPanEnc: encryptPii(pan),
          cardLast4: pan.slice(-4),
          shebaEnc: encryptPii(sheba),
          shebaHash: hashPii(sheba),
          isDefault: isFirst,
          updatedAt: new Date(),
        }),
      );
      return this.shape(row);
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateBankAccountDto) {
    const row = await this.bankAccountRepo.findOneBy({ id });
    if (!row || row.userId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'حساب بانکی یافت نشد.',
      });
    }
    if (dto.isDefault) {
      await this.bankAccountRepo.manager.transaction(async (tx) => {
        await tx.update(
          SavedBankAccount,
          { userId: user.id, isDefault: true },
          { isDefault: false, updatedAt: new Date() },
        );
        await tx.update(
          SavedBankAccount,
          { id },
          { isDefault: true, updatedAt: new Date() },
        );
      });
    }
    const updated = await findOneOrThrow(this.bankAccountRepo, {
      where: { id },
    });
    return this.shape(updated);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const row = await this.bankAccountRepo.findOneBy({ id });
    if (!row || row.userId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'حساب بانکی یافت نشد.',
      });
    }
    await this.bankAccountRepo.delete({ id });
    if (row.isDefault) {
      const next = await this.bankAccountRepo.findOne({
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });
      if (next) {
        await this.bankAccountRepo.update(
          { id: next.id },
          { isDefault: true, updatedAt: new Date() },
        );
      }
    }
    return { removed: true };
  }
}
