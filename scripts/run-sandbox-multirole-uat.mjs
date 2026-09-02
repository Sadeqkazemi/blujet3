#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliArgs = process.argv.slice(2);
const includeBrowser = cliArgs.includes('--browser');
const listOnly = cliArgs.includes('--list');
const flowArg = cliArgs.find((arg) => arg.startsWith('--flow='));
const selectedFlowIds = flowArg
  ? new Set(flowArg.slice('--flow='.length).split(',').map((value) => value.trim()))
  : null;

const flows = [
  {
    id: '1',
    name: 'Commercial flight and pricing approval',
    backend: ['test/flights.e2e-spec.ts', 'test/pricing.e2e-spec.ts'],
    browser: ['e2e/flights-journey.spec.ts', 'e2e/pricing-journey.spec.ts'],
  },
  {
    id: '2',
    name: 'IT services and employee permissions',
    backend: [
      'test/it-manager.e2e-spec.ts',
      'test/phase31-employee-it-dept-permissions.e2e-spec.ts',
    ],
    browser: ['e2e/it-manager-journey.spec.ts'],
  },
  {
    id: '3',
    name: 'Managerial seat locking',
    backend: ['test/phase13-managerial-lock-governance.e2e-spec.ts'],
    browser: ['e2e/reservation-journey.spec.ts'],
  },
  {
    id: '4',
    name: 'Passenger authentication and purchase lifecycle',
    backend: [
      'test/auth.e2e-spec.ts',
      'test/booking-engine.e2e-spec.ts',
      'test/customers.e2e-spec.ts',
      'test/customer-identity.e2e-spec.ts',
    ],
    browser: ['e2e/public-purchase-journey.spec.ts'],
  },
  {
    id: '5',
    name: 'Agency onboarding, portal and allotment bookkeeping',
    backend: [
      'test/phase16-agency-signup.e2e-spec.ts',
      'test/agencies.e2e-spec.ts',
      'test/agency-portal.e2e-spec.ts',
      'test/phase13-agency-allotments.e2e-spec.ts',
    ],
    browser: [
      'e2e/agencies-journey.spec.ts',
      'e2e/agency-portal-journey.spec.ts',
    ],
  },
  {
    id: '6',
    name: 'Refund, club, PNR and settlement invariants',
    backend: [
      'test/refunds.e2e-spec.ts',
      'test/club.e2e-spec.ts',
      'test/phase13e-pnr-lifecycle-reconciliation.e2e-spec.ts',
      'test/phase27-employee-fl-manage-ag-settle-fn-invoices.e2e-spec.ts',
    ],
    browser: [
      'e2e/refunds-journey.spec.ts',
      'e2e/club-journey.spec.ts',
      'e2e/finance-reports-journey.spec.ts',
    ],
  },
];

const selectedFlows = selectedFlowIds
  ? flows.filter((flow) => selectedFlowIds.has(flow.id))
  : flows;

if (selectedFlows.length === 0) {
  console.error('No valid flow selected. Use --flow=1,2,3,4,5,6.');
  process.exit(2);
}

const unique = (items) => [...new Set(items)];
const backendFiles = unique(selectedFlows.flatMap((flow) => flow.backend));
const browserFiles = unique(selectedFlows.flatMap((flow) => flow.browser));

console.log('Selected sandbox multi-role UAT flows:');
for (const flow of selectedFlows) console.log(`  ${flow.id}. ${flow.name}`);
console.log(`Backend suites: ${backendFiles.length}`);
console.log(`Browser journeys: ${includeBrowser ? browserFiles.length : 0} (use --browser to enable)`);

if (listOnly) {
  console.log('\nBackend:');
  backendFiles.forEach((file) => console.log(`  ${file}`));
  console.log('\nBrowser:');
  browserFiles.forEach((file) => console.log(`  ${file}`));
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(label, cwd, args, env = process.env) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(npx, args, {
    cwd,
    env,
    stdio: 'inherit',
    // Windows cannot spawn npm/npx `.cmd` shims directly with shell:false.
    // All arguments above are repository-owned constants, not user input.
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function testDatabaseTarget() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const envText = readFileSync(path.join(repoRoot, 'backend', '.env.test'), 'utf8');
    const match = envText.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m);
    databaseUrl = match?.[1];
  }
  if (!databaseUrl) throw new Error('DATABASE_URL is missing from the environment and backend/.env.test.');
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
  };
}

function canConnect({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1_500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

const databaseTarget = testDatabaseTarget();
if (!(await canConnect(databaseTarget))) {
  console.error(
    `PostgreSQL test database is unavailable at ${databaseTarget.host}:${databaseTarget.port}. ` +
      'Start the test database (or set DATABASE_URL) before running multi-role UAT.',
  );
  process.exit(2);
}

run(
  'Backend database-backed UAT',
  path.join(repoRoot, 'backend'),
  [
    'jest',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    '--runTestsByPath',
    ...backendFiles,
  ],
);

if (includeBrowser) {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
  const hostname = new URL(baseUrl).hostname;
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  if (!isLocal && process.env.UAT_ALLOW_REMOTE_MUTATION !== 'YES') {
    console.error(
      `Refusing browser UAT against non-local ${baseUrl}. ` +
        'Use a dedicated UAT environment, or set UAT_ALLOW_REMOTE_MUTATION=YES explicitly.',
    );
    process.exit(2);
  }
  run(
    'Browser multi-role UAT',
    path.join(repoRoot, 'frontend'),
    ['playwright', 'test', ...browserFiles],
  );
}

console.log('\nAutomated UAT suites passed.');
console.log('Known product gaps remain release blockers; see docs/features/sandbox-multirole-operational-uat.md.');
