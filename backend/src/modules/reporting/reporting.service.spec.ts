import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ReportingService } from './reporting.service';
import { AgenciesService } from '../agencies/agencies.service';

describe('ReportingService (unit)', () => {
  let service: ReportingService;

  beforeEach(() => {
    service = new ReportingService(
      {} as DataSource,
      {} as AgenciesService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe('buildBuckets', () => {
    it('year granularity returns 12 consecutive calendar-month buckets ending at the current month', () => {
      const buckets = (
        service as unknown as {
          buildBuckets: (
            g: string,
            p: object,
          ) => { key: string; start: Date; end: Date }[];
        }
      ).buildBuckets('year', {});
      expect(buckets).toHaveLength(12);
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i].start.getTime()).toBe(buckets[i - 1].end.getTime());
      }
      const now = new Date();
      expect(buckets[buckets.length - 1].start.getUTCMonth()).toBe(
        now.getUTCMonth(),
      );
    });

    it('q6/q3 return 6/3 buckets respectively', () => {
      const svc = service as unknown as {
        buildBuckets: (g: string, p: object) => unknown[];
      };
      expect(svc.buildBuckets('q6', {})).toHaveLength(6);
      expect(svc.buildBuckets('q3', {})).toHaveLength(3);
    });

    it('month granularity returns one bucket per day in that month, and throws without periodStart', () => {
      const svc = service as unknown as {
        buildBuckets: (g: string, p: object) => { start: Date; end: Date }[];
      };
      const buckets = svc.buildBuckets('month', {
        periodStart: '2026-02-01T00:00:00.000Z',
      });
      expect(buckets).toHaveLength(28); // 2026 is not a leap year
      expect(buckets[0].start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(buckets[27].end.toISOString()).toBe('2026-03-01T00:00:00.000Z');

      expect(() => svc.buildBuckets('month', {})).toThrow(BadRequestException);
    });

    it('day granularity returns exactly one 24h bucket, and throws without date', () => {
      const svc = service as unknown as {
        buildBuckets: (g: string, p: object) => { start: Date; end: Date }[];
      };
      const buckets = svc.buildBuckets('day', {
        date: '2026-06-15T00:00:00.000Z',
      });
      expect(buckets).toHaveLength(1);
      expect(buckets[0].end.getTime() - buckets[0].start.getTime()).toBe(
        24 * 60 * 60 * 1000,
      );

      expect(() => svc.buildBuckets('day', {})).toThrow(BadRequestException);
    });
  });

  describe('resolvePeriodRange', () => {
    it('flight granularity requires flightNo', () => {
      const svc = service as unknown as {
        resolvePeriodRange: (g: string, p: object) => unknown;
      };
      expect(() => svc.resolvePeriodRange('flight', {})).toThrow(
        BadRequestException,
      );
      expect(svc.resolvePeriodRange('flight', { flightNo: 'EP-821' })).toEqual(
        expect.objectContaining({ flightNo: 'EP-821' }),
      );
    });

    it('an unknown periodKey is rejected', () => {
      const svc = service as unknown as {
        resolvePeriodRange: (g: string, p: object) => unknown;
      };
      expect(() =>
        svc.resolvePeriodRange('q6', { periodKey: 'not-a-bucket' }),
      ).toThrow(BadRequestException);
    });

    it('omitting periodKey spans the full bucket range', () => {
      const svc = service as unknown as {
        buildBuckets: (g: string, p: object) => { start: Date; end: Date }[];
        resolvePeriodRange: (
          g: string,
          p: object,
        ) => { start: Date; end: Date };
      };
      const buckets = svc.buildBuckets('q3', {});
      const range = svc.resolvePeriodRange('q3', {});
      expect(range.start.getTime()).toBe(buckets[0].start.getTime());
      expect(range.end.getTime()).toBe(
        buckets[buckets.length - 1].end.getTime(),
      );
    });
  });
});
