import { FlightDefinitionStatus } from '../../database/enums';
import {
  commercialSalesHealth,
  isCommercialActiveOccurrence,
  isCommercialInventoryVisible,
} from './flights.service';

describe('commercial active inventory policy', () => {
  const now = new Date('2026-08-13T10:00:00.000Z');

  it('shows only sellable CEO-approved inventory', () => {
    expect(
      isCommercialInventoryVisible({
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.PUBLISHED,
        approvedSnapshot: null,
      }),
    ).toBe(true);
    expect(
      isCommercialInventoryVisible({
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.DRAFT,
        approvedSnapshot: null,
      }),
    ).toBe(false);
    expect(
      isCommercialInventoryVisible({
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.PENDING_REVISION,
        approvedSnapshot: { id: 'approved-snapshot' },
      }),
    ).toBe(true);
  });

  it('keeps every approved occurrence in the active list beyond seven days', () => {
    const occurrences = Array.from({ length: 17 }, (_, index) => ({
      status: 'SCHEDULED' as const,
      departureAt: new Date(now.getTime() + (index + 1) * 3 * 86_400_000),
    }));

    expect(
      occurrences.filter((row) => isCommercialActiveOccurrence(row, now)),
    ).toHaveLength(17);
  });

  it('does not expose inventory before sale starts or after sale ends', () => {
    const base = {
      status: 'SCHEDULED' as const,
      definitionStatus: FlightDefinitionStatus.PUBLISHED,
      approvedSnapshot: null,
    };
    expect(
      isCommercialInventoryVisible(
        { ...base, saleStartsAt: new Date('2026-08-13T11:00:00.000Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isCommercialInventoryVisible(
        { ...base, saleEndsAt: new Date('2026-08-13T09:00:00.000Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isCommercialInventoryVisible(
        {
          ...base,
          saleStartsAt: new Date('2026-08-13T09:00:00.000Z'),
          saleEndsAt: new Date('2026-08-13T11:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('keeps a sold-out flight active until its departure time', () => {
    expect(
      isCommercialInventoryVisible(
        {
          status: 'SCHEDULED',
          definitionStatus: FlightDefinitionStatus.PUBLISHED,
          approvedSnapshot: null,
        },
        now,
      ),
    ).toBe(true);

    const health = commercialSalesHealth(
      new Date('2026-08-14T10:00:00.000Z'),
      140,
      140,
      now,
    );
    expect(health.occupancyPct).toBe(100);
    expect(health.isWeak).toBe(false);
  });

  it('flags weak sales inside the seven-day window from server time', () => {
    const health = commercialSalesHealth(
      new Date('2026-08-14T10:00:00.000Z'),
      20,
      140,
      now,
    );
    expect(health.isWeak).toBe(true);
    expect(health.occupancyPct).toBe(14);
    expect(health.hoursToDeparture).toBe(24);
    expect(health.reasonFa).toContain('فروش');
  });

  it('does not flag healthy or distant inventory', () => {
    expect(
      commercialSalesHealth(
        new Date('2026-08-14T10:00:00.000Z'),
        100,
        140,
        now,
      ).isWeak,
    ).toBe(false);
    expect(
      commercialSalesHealth(
        new Date('2026-08-21T11:00:00.000Z'),
        20,
        140,
        now,
      ).isWeak,
    ).toBe(false);
  });
});
