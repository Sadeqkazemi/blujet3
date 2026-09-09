import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CartableCategory, CartableStatus } from '../../database/enums';

type CartableSummaryRow = {
  category: string;
  status: string;
  count: number;
  unread: number;
  oldestCreatedAt: Date | null;
};

type CartableTaskRow = {
  id: string;
  assigneeId: string;
  category: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string;
  resolvedAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class OpsAdminReadService {
  constructor(private readonly dataSource: DataSource) {}

  async cartableSummary() {
    const rows = await this.dataSource.query<CartableSummaryRow[]>(
      `SELECT category::text AS category, status::text AS status,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE "readAt" IS NULL)::int AS unread,
          MIN("createdAt") AS "oldestCreatedAt"
       FROM ops.cartable_tasks
       GROUP BY category, status
       ORDER BY category ASC, status ASC`,
    );
    return {
      observedAt: new Date().toISOString(),
      groups: rows.map((row) => ({
        category: row.category,
        status: row.status,
        count: Number(row.count),
        unread: Number(row.unread),
        oldestCreatedAt: row.oldestCreatedAt
          ? new Date(row.oldestCreatedAt).toISOString()
          : null,
      })),
    };
  }

  async listCartableTasks(
    status: CartableStatus,
    category: CartableCategory | undefined,
    limit: number,
  ) {
    const rows = await this.dataSource.query<CartableTaskRow[]>(
      `SELECT id, "assigneeId", category::text AS category,
          "sourceType"::text AS "sourceType", "sourceId",
          status::text AS status, "resolvedAt", "readAt", "createdAt"
       FROM ops.cartable_tasks
       WHERE status::text = $1
         AND ($2::text IS NULL OR category::text = $2)
       ORDER BY "createdAt" ASC, id ASC
       LIMIT $3`,
      [status, category ?? null, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      assigneeId: row.assigneeId,
      category: row.category,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      status: row.status,
      resolvedAt: row.resolvedAt
        ? new Date(row.resolvedAt).toISOString()
        : null,
      readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }
}
