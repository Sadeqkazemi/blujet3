import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

/**
 * E2E suites assume the TypeORM seed (staff logins, flights, club, …).
 * After the Prisma→TypeORM cutover, CI only ran migrations — never seed —
 * which produced systemic 401 / EntityNotFoundError("User") failures.
 * Seed once before the suite (idempotent).
 */
export default function globalSetup(): void {
  const backendRoot = path.join(__dirname, '..');
  dotenv.config({
    path: path.join(backendRoot, '.env.test'),
    override: true,
    quiet: true,
  });
  execSync(
    'npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts',
    {
      cwd: backendRoot,
      stdio: 'inherit',
      env: process.env,
    },
  );
  execSync('npx tsx src/database/seed.ts', {
    cwd: backendRoot,
    stdio: 'inherit',
    env: process.env,
  });
}
