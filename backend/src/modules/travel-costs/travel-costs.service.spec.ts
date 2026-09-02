import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { TravelCostsService } from './travel-costs.service';

const actor = {
  id: 'commercial-1',
  fullName: 'مدیر بازرگانی',
  role: 'COMMERCIAL_MANAGER',
} as AuthenticatedUser;

function fixedRow(code: 'SEAT_SELECTION' | 'PET') {
  return {
    id: `fixed-${code}`,
    code,
    titleFa: code === 'PET' ? 'حمل حیوان خانگی' : 'انتخاب صندلی',
    active: true,
    purchaseEnabled: true,
  } as TravelExtraSetting;
}

describe('TravelCostsService fixed checkout rules', () => {
  function serviceFor(row: TravelExtraSetting) {
    const repo = {
      findOneBy: jest.fn().mockResolvedValue(row),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const ancillary = { overlayTravelExtras: jest.fn() };
    return {
      service: new TravelCostsService(repo as never, audit as never, ancillary as never),
      repo,
    };
  }

  it.each(['SEAT_SELECTION', 'PET'] as const)(
    'does not allow %s to be disabled',
    async (code) => {
      const { service, repo } = serviceFor(fixedRow(code));

      await expect(
        service.update(actor, `fixed-${code}`, { active: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['SEAT_SELECTION', 'PET'] as const)(
    'does not allow %s to be deleted',
    async (code) => {
      const { service, repo } = serviceFor(fixedRow(code));

      await expect(service.remove(actor, `fixed-${code}`)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    },
  );
});
