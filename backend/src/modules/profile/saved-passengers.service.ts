import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { SavedPassenger } from '../../database/entities/saved-passenger.entity';
import { ErrorCode } from '../../common/errors';
import {
  decryptPii,
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
} from '../../common/pii-crypto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  CreateSavedPassengerDto,
  UpdateSavedPassengerDto,
} from './dto/saved-passenger.dtos';

const MAX_SAVED = 20;

type SavedPassengerRow = SavedPassenger;

@Injectable()
export class SavedPassengersService {
  constructor(
    @InjectRepository(SavedPassenger)
    private readonly passengerRepo: Repository<SavedPassenger>,
  ) {}

  private shape(row: SavedPassengerRow) {
    return {
      id: row.id,
      fullName: row.fullName,
      latinName: row.latinName,
      gender: row.gender,
      birthDate: row.birthDate,
      nationalId: row.nationalIdEnc ? decryptPii(row.nationalIdEnc) : null,
      passportNo: row.passportNoEnc ? decryptPii(row.passportNoEnc) : null,
      mobile: row.mobileEnc ? decryptPii(row.mobileEnc) : null,
      isChild: row.isChild,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private normalizeBirthDate(input: string): string {
    const day = input.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'تاریخ تولد نامعتبر است.',
      });
    }
    return day;
  }

  private assertHasIdDoc(
    nationalId?: string | null,
    passportNo?: string | null,
  ) {
    const hasNational = Boolean(nationalId?.trim());
    const hasPassport = Boolean(passportNo?.trim());
    if (!hasNational && !hasPassport) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'حداقل یکی از کد ملی یا شماره گذرنامه الزامی است.',
      });
    }
  }

  private normalizeNationalIdField(input?: string | null): string | null {
    if (input === undefined || input === null || input.trim() === '')
      return null;
    const nationalId = normalizeNationalId(input);
    if (!isValidIranianNationalId(nationalId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'کد ملی نامعتبر است.',
      });
    }
    return nationalId;
  }

  private async assertNotDuplicateNationalId(
    userId: string,
    nationalId: string | null,
    excludeId?: string,
  ) {
    if (!nationalId) return;
    const existing = await this.passengerRepo.findOne({
      where: {
        userId,
        nationalIdHash: hashPii(nationalId),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این کد ملی قبلاً برای مسافر دیگری ذخیره شده است.',
      });
    }
  }

  async listMine(user: AuthenticatedUser) {
    const rows = await this.passengerRepo.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.shape(row));
  }

  async create(user: AuthenticatedUser, dto: CreateSavedPassengerDto) {
    const nationalId = this.normalizeNationalIdField(dto.nationalId);
    const passportNo = dto.passportNo?.trim() || null;
    this.assertHasIdDoc(nationalId, passportNo);

    const count = await this.passengerRepo.count({
      where: { userId: user.id },
    });
    if (count >= MAX_SAVED) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: `حداکثر ${MAX_SAVED} مسافر را می‌توانید ذخیره کنید.`,
      });
    }

    await this.assertNotDuplicateNationalId(user.id, nationalId);

    const row = await this.passengerRepo.save(
      this.passengerRepo.create({
        userId: user.id,
        fullName: dto.fullName.trim(),
        latinName: dto.latinName.trim().toUpperCase(),
        gender: dto.gender,
        birthDate: this.normalizeBirthDate(dto.birthDate),
        nationalIdEnc: nationalId ? encryptPii(nationalId) : null,
        nationalIdHash: nationalId ? hashPii(nationalId) : null,
        passportNoEnc: passportNo ? encryptPii(passportNo) : null,
        mobileEnc: dto.mobile?.trim() ? encryptPii(dto.mobile.trim()) : null,
        isChild: dto.isChild ?? false,
        updatedAt: new Date(),
      }),
    );
    return this.shape(row);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateSavedPassengerDto,
  ) {
    const row = await this.passengerRepo.findOneBy({ id });
    if (!row || row.userId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مسافر ذخیره‌شده یافت نشد.',
      });
    }

    const nationalId =
      dto.nationalId !== undefined
        ? this.normalizeNationalIdField(dto.nationalId)
        : row.nationalIdEnc
          ? decryptPii(row.nationalIdEnc)
          : null;
    const passportNo =
      dto.passportNo !== undefined
        ? dto.passportNo?.trim() || null
        : row.passportNoEnc
          ? decryptPii(row.passportNoEnc)
          : null;
    this.assertHasIdDoc(nationalId, passportNo);
    await this.assertNotDuplicateNationalId(user.id, nationalId, id);

    await this.passengerRepo.update(
      { id },
      {
        ...(dto.fullName !== undefined
          ? { fullName: dto.fullName.trim() }
          : {}),
        ...(dto.latinName !== undefined
          ? { latinName: dto.latinName.trim().toUpperCase() }
          : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: this.normalizeBirthDate(dto.birthDate) }
          : {}),
        ...(dto.nationalId !== undefined
          ? {
              nationalIdEnc: nationalId ? encryptPii(nationalId) : null,
              nationalIdHash: nationalId ? hashPii(nationalId) : null,
            }
          : {}),
        ...(dto.passportNo !== undefined
          ? { passportNoEnc: passportNo ? encryptPii(passportNo) : null }
          : {}),
        ...(dto.mobile !== undefined
          ? {
              mobileEnc: dto.mobile?.trim()
                ? encryptPii(dto.mobile.trim())
                : null,
            }
          : {}),
        ...(dto.isChild !== undefined ? { isChild: dto.isChild } : {}),
        updatedAt: new Date(),
      },
    );
    const updated = await this.passengerRepo.findOneByOrFail({ id });
    return this.shape(updated);
  }

  async remove(user: AuthenticatedUser, id: string) {
    const row = await this.passengerRepo.findOneBy({ id });
    if (!row || row.userId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مسافر ذخیره‌شده یافت نشد.',
      });
    }
    await this.passengerRepo.delete({ id });
    return { removed: true };
  }
}
