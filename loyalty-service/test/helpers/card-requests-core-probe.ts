import 'reflect-metadata';
import { isDeepStrictEqual } from 'node:util';
import { DataSource } from '../../../backend/node_modules/typeorm';
import { dataSourceOptions } from '../../../backend/dist/database/data-source.options';
import { ClubMember } from '../../../backend/dist/database/entities/club-member.entity';
import { ClubCardRequest } from '../../../backend/dist/database/entities/club-card-request.entity';
import { ClubService } from '../../../backend/dist/modules/club/club.service';
import { LoyaltyCardRequestsClient } from '../../../backend/dist/modules/club/loyalty-card-requests.client';

async function run() {
  const url = new URL(process.env.CORE_TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test'))
    throw new Error('Test database required');
  if (dataSourceOptions.type !== 'postgres')
    throw new Error('PostgreSQL required');
  const db = await new DataSource({
    ...dataSourceOptions,
    url: url.toString(),
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 2,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    },
  }).initialize();
  let calls = 0;
  let remoteResults = 0;
  let warnings = 0;
  const values: Record<string, string | undefined> = {
    LOYALTY_CARD_REQUESTS_READ_ENABLED: 'false',
    LOYALTY_SERVICE_URL: process.env.PROBE_SERVICE_URL,
    LOYALTY_INTERNAL_TOKEN: process.env.PROBE_INTERNAL_TOKEN,
  };
  const client = new LoyaltyCardRequestsClient(
    { get: (key: string) => values[key] } as never,
    {
      warn: () => {
        warnings += 1;
      },
    } as never,
  );
  const service = new ClubService(
    undefined as never,
    db.getRepository(ClubMember),
    db.getRepository(ClubCardRequest),
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    {
      get: async (requestId?: string) => {
        calls += 1;
        const result = await client.get(requestId);
        if (result !== undefined) remoteResults += 1;
        return result;
      },
    } as never,
  );
  try {
    const local: unknown = JSON.parse(
      JSON.stringify(await service.listRequests()),
    );
    calls = 0;
    values.LOYALTY_CARD_REQUESTS_READ_ENABLED =
      process.env.PROBE_ENABLED ?? 'true';
    try {
      const cutover: unknown = JSON.parse(
        JSON.stringify(await service.listRequests('card-requests-contract')),
      );
      process.stdout.write(
        JSON.stringify({
          status: isDeepStrictEqual(local, cutover) ? 'MATCH' : 'MISMATCH',
          calls,
          remoteResults,
          warnings,
        }) + '\n',
      );
    } catch {
      process.stdout.write(
        JSON.stringify({ status: 'REJECTED', calls, remoteResults, warnings }) +
          '\n',
      );
    }
  } finally {
    await db.destroy();
  }
}

void run().catch(() => {
  process.stderr.write('Core contract probe unavailable.\n');
  process.exitCode = 1;
});
