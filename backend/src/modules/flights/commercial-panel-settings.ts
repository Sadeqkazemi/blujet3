import type { JsonValue } from '../../database/json-types';
import type { CabinClass } from '../../database/enums';

export interface AgencyReleaseClassSettings {
  seats: number;
  priceIrr: string;
  special?: boolean;
}

export interface CommercialPanelSettings {
  /** When explicitly false, flight is hidden from public search. Default: visible. */
  siteVisible?: boolean;
  /** Per fare-class site price overrides keyed by class label (e.g. «اکونومی Y»). */
  classSitePrices?: Record<string, string>;
  /** Per-class agency seat releases keyed by class label. */
  agencyRelease?: Record<string, AgencyReleaseClassSettings>;
}

function stringifyScalar(value: unknown, fallback = ''): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return fallback;
}

export interface CommercialClassBreakdownRow {
  label: string;
  cabin: CabinClass;
  classCode?: string;
  capacity: number;
  sold: number;
}

export function parseCommercialPanelSettings(
  raw: JsonValue | null | undefined,
): CommercialPanelSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const settings: CommercialPanelSettings = {};
  if (typeof obj.siteVisible === 'boolean') {
    settings.siteVisible = obj.siteVisible;
  }
  if (obj.classSitePrices && typeof obj.classSitePrices === 'object') {
    const prices: Record<string, string> = {};
    for (const [key, val] of Object.entries(
      obj.classSitePrices as Record<string, unknown>,
    )) {
      if (val != null) prices[key] = stringifyScalar(val);
    }
    settings.classSitePrices = prices;
  }
  if (obj.agencyRelease && typeof obj.agencyRelease === 'object') {
    const release: Record<string, AgencyReleaseClassSettings> = {};
    for (const [key, val] of Object.entries(
      obj.agencyRelease as Record<string, unknown>,
    )) {
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const row = val as Record<string, unknown>;
      release[key] = {
        seats: Number(row.seats ?? 0),
        priceIrr: stringifyScalar(row.priceIrr, '0'),
        special: row.special === true,
      };
    }
    settings.agencyRelease = release;
  }
  return settings;
}

export function resolveSiteVisible(
  settings: CommercialPanelSettings,
): boolean {
  return settings.siteVisible !== false;
}

export function mergeCommercialPanelSettings(
  current: JsonValue | null | undefined,
  patch: CommercialPanelSettings,
): CommercialPanelSettings {
  const base = parseCommercialPanelSettings(current);
  return {
    ...base,
    ...patch,
    classSitePrices: patch.classSitePrices
      ? { ...base.classSitePrices, ...patch.classSitePrices }
      : base.classSitePrices,
    agencyRelease: patch.agencyRelease
      ? { ...base.agencyRelease, ...patch.agencyRelease }
      : base.agencyRelease,
  };
}

export function agencyReleaseSeatTotal(
  settings: CommercialPanelSettings,
): number {
  if (!settings.agencyRelease) return 0;
  return Object.values(settings.agencyRelease).reduce(
    (sum, row) => sum + (row.seats > 0 ? row.seats : 0),
    0,
  );
}

const CABIN_LABEL_FA: Record<CabinClass, string> = {
  ECONOMY: 'اکونومی',
  COMFORT: 'کامفورت',
  BUSINESS: 'بیزینس',
  FIRST: 'درجه یک',
};

export function cabinLabelFa(cabin: CabinClass): string {
  return CABIN_LABEL_FA[cabin] ?? cabin;
}

export function buildClassBreakdown(input: {
  capacity: number;
  cabinCapacities?: unknown;
  soldTotal: number;
  soldByCabin: Map<CabinClass, number>;
  fareRules: {
    cabin: CabinClass;
    classCode: string;
    seatsAllocated: number;
  }[];
}): CommercialClassBreakdownRow[] {
  const { capacity, soldTotal, soldByCabin, fareRules } = input;
  if (fareRules.length > 0) {
    const byCabin = new Map<CabinClass, typeof fareRules>();
    for (const rule of fareRules) {
      const list = byCabin.get(rule.cabin) ?? [];
      list.push(rule);
      byCabin.set(rule.cabin, list);
    }
    const rows: CommercialClassBreakdownRow[] = [];
    for (const [cabin, rules] of byCabin) {
      const cabinSold = soldByCabin.get(cabin) ?? 0;
      const cabinCap = rules.reduce((a, r) => a + r.seatsAllocated, 0) || 1;
      for (const rule of rules) {
        const sold =
          cabinCap > 0
            ? Math.round((cabinSold * rule.seatsAllocated) / cabinCap)
            : 0;
        rows.push({
          label: `${cabinLabelFa(rule.cabin)} ${rule.classCode}`,
          cabin: rule.cabin,
          classCode: rule.classCode,
          capacity: rule.seatsAllocated,
          sold,
        });
      }
    }
    return rows;
  }

  const capacities = input.cabinCapacities;
  if (Array.isArray(capacities) && capacities.length > 0) {
    return capacities
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const cabin = (row as { cabin?: CabinClass }).cabin;
        const seats = Number((row as { seats?: number }).seats ?? 0);
        if (!cabin || seats <= 0) return null;
        return {
          label: cabinLabelFa(cabin),
          cabin,
          capacity: seats,
          sold: soldByCabin.get(cabin) ?? 0,
        };
      })
      .filter((row): row is CommercialClassBreakdownRow => row != null);
  }

  return [
    {
      label: cabinLabelFa('ECONOMY'),
      cabin: 'ECONOMY',
      capacity,
      sold: soldTotal,
    },
  ];
}

export function commercialRowExtras(input: {
  settings: CommercialPanelSettings;
  classBreakdown: CommercialClassBreakdownRow[];
  lockedSeats: number;
  routeAgencyPriceIrr: string | null;
}) {
  const agencyReleaseSeats = agencyReleaseSeatTotal(input.settings);
  return {
    siteVisible: resolveSiteVisible(input.settings),
    classBreakdown: input.classBreakdown,
    agencyReleaseSeats,
    lockedSeats: input.lockedSeats,
    routeAgencyPriceIrr: input.routeAgencyPriceIrr,
    classSitePrices: input.settings.classSitePrices ?? {},
    agencyRelease: input.settings.agencyRelease ?? {},
  };
}
