import { Repository } from 'typeorm';
import { CareersService } from './careers.service';
import { CareersSettings } from '../../database/entities/careers-settings.entity';
import { JobPosting } from '../../database/entities/job-posting.entity';
import { JobApplication } from '../../database/entities/job-application.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';

function makeService(userFind: jest.Mock) {
  const userRepo = { find: userFind } as unknown as Repository<User>;
  return new CareersService(
    {} as Repository<CareersSettings>,
    {} as Repository<JobPosting>,
    {} as Repository<JobApplication>,
    {} as Repository<StoredFile>,
    userRepo,
    {} as AuditService,
  );
}

describe('CareersService (unit)', () => {
  describe('referralTargets', () => {
    it('combines active COMMERCIAL/FINANCE managers with the singleton CEO/SENIOR_MANAGER, labelled with their Persian role name', async () => {
      const find = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'u1', fullName: 'رضا مرادی', role: 'COMMERCIAL_MANAGER' },
          { id: 'u2', fullName: 'سحر کاظمی', role: 'FINANCE_MANAGER' },
        ])
        .mockResolvedValueOnce([
          { id: 'u3', fullName: 'محمد رحیمی', role: 'SENIOR_MANAGER' },
          { id: 'u4', fullName: 'مریم احمدی', role: 'CEO' },
        ]);
      const service = makeService(find);

      const targets = await (
        service as unknown as {
          referralTargets: () => Promise<{ id: string; labelFa: string }[]>;
        }
      ).referralTargets();

      expect(targets).toEqual([
        { id: 'u1', labelFa: 'رضا مرادی (مدیر بازرگانی)' },
        { id: 'u2', labelFa: 'سحر کاظمی (مدیر مالی)' },
        { id: 'u3', labelFa: 'محمد رحیمی (مدیر ارشد)' },
        { id: 'u4', labelFa: 'مریم احمدی (مدیر عامل)' },
      ]);
      expect(find).toHaveBeenCalledTimes(2);
    });

    it('omits an inactive staff member (query filters isActive: true; an empty result stays empty)', async () => {
      const find = jest.fn().mockResolvedValue([]);
      const service = makeService(find);

      const targets = await (
        service as unknown as {
          referralTargets: () => Promise<unknown[]>;
        }
      ).referralTargets();

      expect(targets).toEqual([]);
    });
  });

  describe('appendHistory', () => {
    it('appends a new entry to an existing history array without mutating it', () => {
      const service = makeService(jest.fn());
      const existing = [
        {
          step: 'submitted',
          label: 'ثبت درخواست',
          at: '2026-01-01T00:00:00.000Z',
        },
      ];
      const result = (
        service as unknown as {
          appendHistory: (
            existing: unknown,
            step: string,
            label: string,
          ) => { step: string; label: string; at: string }[];
        }
      ).appendHistory(existing, 'referred', 'ارجاع به مدیر ارشد');

      expect(existing).toHaveLength(1);
      expect(result).toHaveLength(2);
      expect(result[1].step).toBe('referred');
      expect(result[1].label).toBe('ارجاع به مدیر ارشد');
      expect(typeof result[1].at).toBe('string');
    });

    it('treats a non-array existing value (e.g. a default `[]` Json read as unknown) as an empty history', () => {
      const service = makeService(jest.fn());
      const result = (
        service as unknown as {
          appendHistory: (
            existing: unknown,
            step: string,
            label: string,
          ) => unknown[];
        }
      ).appendHistory(null, 'hired', 'نتیجهٔ استخدام: پذیرفته شد');
      expect(result).toHaveLength(1);
    });
  });
});
