import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = process.cwd();
const packageJson = JSON.parse(
  readFileSync(join(backendRoot, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };
const dockerfile = readFileSync(join(backendRoot, 'Dockerfile'), 'utf8');
const entrypoint = readFileSync(
  join(backendRoot, 'docker-entrypoint.sh'),
  'utf8',
);
const compose = readFileSync(
  join(backendRoot, '..', 'docker-compose.prod.yml'),
  'utf8',
);
const notifyComposeSection =
  compose.split('\n  notify-service:')[1]?.split('\n  ml-service:')[0] ?? '';
const experienceComposeSection =
  compose.split('\n  experience-service:')[1]?.split('\n  ml-service:')[0] ??
  '';
const deployWorkflow = readFileSync(
  join(backendRoot, '..', '.github', 'workflows', 'deploy.yml'),
  'utf8',
);
const ciWorkflow = readFileSync(
  join(backendRoot, '..', '.github', 'workflows', 'ci.yml'),
  'utf8',
);
const smokeScript = readFileSync(
  join(backendRoot, '..', 'scripts', 'smoke-service-health.sh'),
  'utf8',
);
const localStartScript = readFileSync(
  join(backendRoot, '..', 'scripts', 'start-local.sh'),
  'utf8',
);
const notifyDockerfile = readFileSync(
  join(backendRoot, '..', 'notify-service', 'Dockerfile'),
  'utf8',
);
const experienceDockerfile = readFileSync(
  join(backendRoot, '..', 'experience-service', 'Dockerfile'),
  'utf8',
);
const notifyFeature = readFileSync(
  join(
    backendRoot,
    '..',
    'docs',
    'features',
    'microservices-phase-1-notify.md',
  ),
  'utf8',
);
const migrationGate = readFileSync(
  join(backendRoot, '..', 'scripts', 'check-expand-only-migrations.mjs'),
  'utf8',
);
const architecture = readFileSync(
  join(
    backendRoot,
    '..',
    'docs',
    'architecture',
    'blujet-architecture-v1.1.md',
  ),
  'utf8',
);
const supersededPssPlan = readFileSync(
  join(backendRoot, '..', 'docs', 'features', 'central-pss-crs.md'),
  'utf8',
);
const frontendDockerfile = readFileSync(
  join(backendRoot, '..', 'frontend', 'Dockerfile'),
  'utf8',
);
const frontendIndex = readFileSync(
  join(backendRoot, '..', 'frontend', 'index.html'),
  'utf8',
);
const seedSource = readFileSync(
  join(backendRoot, 'src', 'database', 'seed.ts'),
  'utf8',
);
const resetSource = readFileSync(
  join(backendRoot, 'src', 'database', 'production-data-reset.ts'),
  'utf8',
);
const uatPurgeSource = readFileSync(
  join(backendRoot, 'src', 'database', 'uat-demo-data-purge.ts'),
  'utf8',
);
const uatFlightCatalogCleanupSource = readFileSync(
  join(backendRoot, 'src', 'database', 'uat-flight-catalog-cleanup.ts'),
  'utf8',
);
const temporaryAccessExtensionV3Source = readFileSync(
  join(backendRoot, 'src', 'database', 'extend-temporary-panel-access-v3.ts'),
  'utf8',
);
const temporaryPhoneLoginReconciliationSource = readFileSync(
  join(
    backendRoot,
    'src',
    'database',
    'reconcile-temporary-phone-login-accounts.ts',
  ),
  'utf8',
);

describe('production backend artifacts', () => {
  it('uses the JavaScript layout emitted by nest build', () => {
    expect(packageJson.scripts['migration:run:prod']).toContain(
      'dist/database/data-source.js',
    );
    expect(packageJson.scripts['seed:prod']).toContain('dist/database/seed.js');
    expect(dockerfile).toContain('CMD ["node", "dist/main.js"]');
  });

  it('ships the PostgreSQL client required by the real backup endpoint', () => {
    expect(dockerfile).toContain('postgresql-client');
    expect(dockerfile).toContain('pg_dump');
  });

  it('does not reference the stale dist/src layout', () => {
    const productionCommands = [
      packageJson.scripts['migration:run:prod'],
      packageJson.scripts['seed:prod'],
      dockerfile,
    ].join('\n');

    expect(productionCommands).not.toContain('dist/src/');
    expect(localStartScript).toContain(
      'node --enable-source-maps dist/main.js',
    );
    expect(localStartScript).not.toContain('dist/src/');
  });

  it('keeps the v1.1 transactional core boundary authoritative', () => {
    expect(architecture).toContain(
      'Core Platform یک واحد استقرار و یک واحد تراکنش است',
    );
    expect(architecture).toContain('inventory` + `orders` + `payments`');
    expect(supersededPssPlan).toContain('SUPERSEDED IN TOPOLOGY');
    expect(supersededPssPlan).toContain(
      '`PSS_INTEGRATION_ENABLED` must remain false',
    );
  });

  it('bakes and verifies the exact deploy identity', () => {
    expect(dockerfile).toContain('ARG GIT_COMMIT_SHA=unknown');
    expect(compose).toContain('GIT_COMMIT_SHA: ${DEPLOY_SHA:-unknown}');
    expect(deployWorkflow).toContain(
      'sh scripts/smoke-service-health.sh docker-compose.prod.yml',
    );
    expect(smokeScript).toContain('actualCommit !== expectedCommit');
    expect(smokeScript).toContain('blujet-backend');
    expect(smokeScript).toContain('blujet-pss');
    expect(smokeScript).toContain('blujet-notify');
    expect(notifyDockerfile).toContain('ARG GIT_COMMIT_SHA=unknown');
    expect(experienceDockerfile).toContain('ARG GIT_COMMIT_SHA=unknown');
    expect(frontendDockerfile).toContain('ARG VITE_GIT_COMMIT_SHA=unknown');
    expect(frontendIndex).toContain(
      'name="blujet-build-service" content="blujet-frontend"',
    );
    expect(frontendIndex).toContain(
      'name="blujet-build-commit" content="%VITE_GIT_COMMIT_SHA%"',
    );
  });

  it('keeps notify internal, asynchronous, authenticated and rollback-safe', () => {
    expect(compose).toContain('notify-service:');
    expect(compose).toContain("NOTIFY_INTEGRATION_ENABLED: 'true'");
    expect(compose).toContain(
      'NOTIFY_INTERNAL_TOKEN: ${NOTIFY_INTERNAL_TOKEN}',
    );
    expect(compose).toContain('NOTIFY_SERVICE_URL: http://notify-service:3200');
    expect(notifyComposeSection).toContain("expose:\n      - '3200'");
    expect(notifyComposeSection).not.toContain('\n    ports:');
    expect(ciWorkflow).toContain('Notify service');
    expect(ciWorkflow).toContain('npm run test:e2e');
    expect(deployWorkflow).toContain(
      'ensure_server_secret NOTIFY_INTERNAL_TOKEN',
    );
    expect(notifyFeature).toContain('notify_outbox_events');
    expect(notifyFeature).toContain('NOTIFY_INTEGRATION_ENABLED=false');
  });

  it('runs the complete backend E2E suite in isolated parallel shards', () => {
    expect(ciWorkflow).toContain('backend-e2e:');
    expect(ciWorkflow).toContain("shard: ['1/4', '2/4', '3/4', '4/4']");
    expect(ciWorkflow).toContain(
      'npm run test:e2e -- --shard=${{ matrix.shard }}',
    );
    expect(ciWorkflow).toContain('- backend-e2e');
  });

  it('keeps Experience internal, authenticated and rollback-safe', () => {
    expect(compose).toContain('experience-service:');
    expect(compose).toContain(
      'EXPERIENCE_INTEGRATION_ENABLED: ${EXPERIENCE_INTEGRATION_ENABLED:-true}',
    );
    expect(compose).toContain(
      'EXPERIENCE_INTERNAL_TOKEN: ${EXPERIENCE_INTERNAL_TOKEN}',
    );
    expect(compose).toContain(
      'EXPERIENCE_SERVICE_URL: http://experience-service:3300',
    );
    expect(experienceComposeSection).toContain("expose:\n      - '3300'");
    expect(experienceComposeSection).not.toContain('\n    ports:');
    expect(ciWorkflow).toContain('Experience service');
    expect(deployWorkflow).toContain(
      'ensure_server_secret EXPERIENCE_INTERNAL_TOKEN',
    );
    expect(smokeScript).toContain('blujet-experience');
  });

  it('keeps Swagger private and search invalidation generation-based', () => {
    expect(compose).not.toContain('SWAGGER_ENABLED');
    expect(compose).toContain('SEARCH_CACHE_GEN: ${SEARCH_CACHE_GEN:-v1}');
  });

  it('rehearses candidate migrations over the baseline and rejects destructive up migrations', () => {
    expect(ciWorkflow).toContain('Backend migration compatibility');
    expect(ciWorkflow).toContain('Build baseline schema');
    expect(ciWorkflow).toContain(
      'Rehearse candidate migration over baseline schema',
    );
    expect(ciWorkflow).toContain('check-expand-only-migrations.mjs');
    expect(migrationGate).toContain('destructive operation in up()');
    expect(migrationGate).toContain("status !== 'A'");
  });

  it('fails closed instead of seeding or simulating payment in production', () => {
    expect(entrypoint).toContain(
      'SEED_ON_START=true is forbidden in production',
    );
    expect(entrypoint).not.toContain('npm run seed:prod || true');
    expect(seedSource).toContain("process.env.NODE_ENV === 'production'");
    expect(seedSource).toContain('Demo seed is forbidden');
    expect(compose).toContain('SMS_PROVIDER: kavenegar');
    expect(compose).toContain('PAYMENT_GATEWAY: ${PAYMENT_GATEWAY:-disabled}');
    expect(compose).not.toContain('PAYMENT_GATEWAY: sandbox');
    expect(packageJson.scripts['data:audit:prod']).toContain(
      'production-data-reset.js',
    );
    expect(resetSource).toContain('PRODUCTION_RESET_BACKUP_REF');
    expect(resetSource).toContain('PRODUCTION_RESET_CONFIRM');
    expect(resetSource).toContain('Dry run only');
  });

  it('guards the UAT demo purge with sandbox, confirmation, and backup checks', () => {
    expect(packageJson.scripts['data:purge:uat']).toContain(
      'uat-demo-data-purge.js',
    );
    expect(packageJson.scripts['data:purge:uat:execute']).toContain(
      '--execute-purge',
    );
    expect(uatPurgeSource).toContain("NODE_ENV !== 'production'");
    expect(uatPurgeSource).toContain("AUTH_SANDBOX_ENABLED !== 'true'");
    expect(uatPurgeSource).toContain('UAT_DEMO_PURGE_CONFIRM');
    expect(uatPurgeSource).toContain('UAT_DEMO_PURGE_BACKUP_REF');
    expect(uatPurgeSource).toContain('Dry run only');
    expect(deployWorkflow).toContain('pg_dump -U blujet -d blujet');
    expect(deployWorkflow).toContain('.blujet-uat-demo-data-purge-v1-complete');
    expect(deployWorkflow).toContain(
      '.blujet-uat-flight-catalog-cleanup-v1-complete',
    );
    expect(deployWorkflow).toContain('CLEAR_BLUJET_UAT_FLIGHT_CATALOG');
    expect(deployWorkflow).toContain('DELETE_BLUJET_UAT_ROUTES');
    expect(uatFlightCatalogCleanupSource).toContain(
      'UAT_FLIGHT_CATALOG_DELETE_ROUTES_CONFIRM',
    );
    expect(uatFlightCatalogCleanupSource).toContain(
      'TRUNCATE TABLE "inventory"."routes", "inventory"."airports" RESTART IDENTITY CASCADE',
    );
    expect(deployWorkflow).toContain('redis-cli FLUSHDB');
  });

  it('guards the third owner-approved UAT access extension', () => {
    expect(packageJson.scripts['accounts:extend:temporary:v3:prod']).toContain(
      'extend-temporary-panel-access-v3.js',
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      "NODE_ENV !== 'production'",
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      'EXTEND_TEMPORARY_PANEL_ACCESS_7_DAYS_V3',
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      'temporary-panel-access-extension-v3',
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      'user.twoFactorEnabled = false',
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      'temporary-panel-account-bootstrap',
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      'temporary-panel-access-extension-v1',
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      'temporary-panel-access-extension-v2',
    );
    expect(temporaryAccessExtensionV3Source).toContain('restoredState');
    expect(temporaryAccessExtensionV3Source).toContain('user.isActive = true');
    expect(temporaryAccessExtensionV3Source).toContain('user.deletedAt = null');
    expect(temporaryAccessExtensionV3Source).toContain(
      'user.isSuperAdmin = false',
    );
    expect(temporaryAccessExtensionV3Source).toContain(
      'user.panelPermissions = null',
    );
    expect(deployWorkflow).toContain(
      '.blujet-uat-temporary-access-extension-v3-complete',
    );
    expect(deployWorkflow).toContain(
      'blujet-uat-temporary-access-extension-v3.json',
    );
  });

  it('reconciles the reserved UAT account hashes with the configured shared password once after v3 recovery', () => {
    const v3ExtensionIndex = deployWorkflow.indexOf(
      'access_extension_v3_sentinel=',
    );
    const reconciliationIndex = deployWorkflow.indexOf(
      'shared_password_reconciliation_v2_sentinel=',
    );
    expect(v3ExtensionIndex).toBeGreaterThanOrEqual(0);
    expect(reconciliationIndex).toBeGreaterThan(v3ExtensionIndex);
    expect(deployWorkflow).toContain(
      '.blujet-uat-shared-password-reconciliation-v2-complete',
    );
    expect(deployWorkflow).toContain(
      'blujet-uat-shared-password-reconciliation-v2.json',
    );
    expect(deployWorkflow).toContain(
      'ROTATE_TEMPORARY_PANEL_PASSWORDS_SHARED_V1',
    );
    expect(deployWorkflow).toContain(
      'backend node dist/database/rotate-temporary-panel-passwords.js --execute',
    );
  });

  it('reconciles the reserved UAT hashes again after the protected shared secret is aligned', () => {
    const reconciliationV2Index = deployWorkflow.indexOf(
      'shared_password_reconciliation_v2_sentinel=',
    );
    const reconciliationV3Index = deployWorkflow.indexOf(
      'shared_password_reconciliation_v3_sentinel=',
    );
    expect(reconciliationV2Index).toBeGreaterThanOrEqual(0);
    expect(reconciliationV3Index).toBeGreaterThan(reconciliationV2Index);
    expect(deployWorkflow).toContain(
      '.blujet-uat-shared-password-reconciliation-v3-complete',
    );
    expect(deployWorkflow).toContain(
      'blujet-uat-shared-password-reconciliation-v3.json',
    );
    expect(
      deployWorkflow.indexOf(
        'backend node dist/database/rotate-temporary-panel-passwords.js --execute',
        reconciliationV3Index,
      ),
    ).toBeGreaterThan(reconciliationV3Index);
  });

  it('canonically reconciles the two reserved phone-login identities once after v3 recovery', () => {
    const sharedPasswordV3Index = deployWorkflow.indexOf(
      'shared_password_reconciliation_v3_sentinel=',
    );
    const phoneLoginIndex = deployWorkflow.indexOf(
      'phone_login_reconciliation_v1_sentinel=',
    );
    expect(sharedPasswordV3Index).toBeGreaterThanOrEqual(0);
    expect(phoneLoginIndex).toBeGreaterThan(sharedPasswordV3Index);
    expect(
      packageJson.scripts['accounts:reconcile:temporary-phone-logins:prod'],
    ).toContain('reconcile-temporary-phone-login-accounts.js');
    expect(temporaryAccessExtensionV3Source).toContain(
      'normalizeIranPhone(expectedAccount.phone)',
    );
    expect(temporaryPhoneLoginReconciliationSource).toContain(
      "NODE_ENV !== 'production'",
    );
    expect(temporaryPhoneLoginReconciliationSource).toContain(
      'assertUatSandboxWriteAllowed()',
    );
    expect(temporaryPhoneLoginReconciliationSource).toContain(
      'RECONCILE_TEMPORARY_PHONE_LOGINS_V1',
    );
    expect(temporaryPhoneLoginReconciliationSource).toContain(
      'temporary-phone-login-reconciliation-v1',
    );
    expect(deployWorkflow).toContain(
      '.blujet-uat-temporary-phone-login-reconciliation-v1-complete',
    );
    expect(deployWorkflow).toContain(
      'blujet-uat-temporary-phone-login-reconciliation-v1.json',
    );
    expect(deployWorkflow).toContain(
      'backend node dist/database/reconcile-temporary-phone-login-accounts.js --execute',
    );
  });
});
