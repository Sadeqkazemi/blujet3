import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ShadowCountsDto,
  ShadowReconciliationDto,
} from './dto/shadow-reconciliation.dto';

type CountName = keyof ShadowCountsDto;
type NullableCounts = Record<CountName, number | null>;

const TABLES = {
  orders: 'pss_orders',
  travellers: 'pss_travellers',
  inventoryTransactions: 'pss_inventory_transactions',
} as const;

@Injectable()
export class ShadowReconciliationService {
  constructor(private readonly dataSource: DataSource) {}

  private async exists(table: string): Promise<boolean> {
    const rows: unknown = await this.dataSource.query(
      'SELECT to_regclass($1) AS relation',
      [`public.${table}`],
    );
    if (!Array.isArray(rows)) return false;
    const first: unknown = rows[0];
    return (
      typeof first === 'object' &&
      first !== null &&
      'relation' in first &&
      first.relation !== null
    );
  }

  private async count(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<number> {
    const rows: unknown = await this.dataSource.query(sql, parameters);
    if (!Array.isArray(rows)) return 0;
    const first: unknown = rows[0];
    if (typeof first !== 'object' || first === null || !('count' in first)) {
      return 0;
    }
    return Number(first.count ?? 0);
  }

  async compare(input: ShadowReconciliationDto) {
    const missingTables: string[] = [];
    const pss: NullableCounts = {
      orders: null,
      travellers: null,
      heldOrders: null,
      ticketedOrders: null,
      inventoryTransactions: null,
    };

    if (await this.exists(TABLES.orders)) {
      pss.orders = await this.count('SELECT count(*) FROM pss_orders');
      pss.heldOrders = await this.count(
        'SELECT count(*) FROM pss_orders WHERE status = $1',
        ['HELD'],
      );
      pss.ticketedOrders = await this.count(
        'SELECT count(*) FROM pss_orders WHERE status = $1',
        ['TICKETED'],
      );
    } else {
      missingTables.push(TABLES.orders);
    }
    if (await this.exists(TABLES.travellers)) {
      pss.travellers = await this.count('SELECT count(*) FROM pss_travellers');
    } else {
      missingTables.push(TABLES.travellers);
    }
    if (await this.exists(TABLES.inventoryTransactions)) {
      pss.inventoryTransactions = await this.count(
        'SELECT count(*) FROM pss_inventory_transactions',
      );
    } else {
      missingTables.push(TABLES.inventoryTransactions);
    }

    const names: CountName[] = [
      'orders',
      'travellers',
      'heldOrders',
      'ticketedOrders',
      'inventoryTransactions',
    ];
    const deltas = Object.fromEntries(
      names.map((name) => [
        name,
        pss[name] === null ? null : pss[name] - input.website[name],
      ]),
    ) as NullableCounts;
    return {
      capturedAt: input.capturedAt,
      comparedAt: new Date().toISOString(),
      website: input.website,
      pss,
      missingTables,
      deltas,
      cutoverReady:
        missingTables.length === 0 && names.every((name) => deltas[name] === 0),
    };
  }
}
