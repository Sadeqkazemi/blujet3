import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OPS_ADMIN_BASELINE_FORBIDDEN_SOURCE_COLUMNS,
  OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS,
  buildOpsAdminBaselineReport,
  fingerprintProjectionRows,
  serializeOpsAdminBaselineReport,
  sha256Hex,
  validateOpsAdminBaselineBackupArtifact,
  validateOpsAdminBaselineDatabaseUrls,
  validateOpsAdminBaselineOptions,
} from './transfer-ops-admin-projection-baseline';

const SOURCE = 'postgresql://owner:secret@localhost:5432/blujet';
const TARGET = 'postgresql://owner:secret@localhost:5432/blujet_ops_admin';

function backupFile(contents: string, ageMs = 0): string {
  const dir = mkdtempSync(join(tmpdir(), 'ops-admin-baseline-'));
  const path = join(dir, 'backup.dump');
  writeFileSync(path, contents);
  if (ageMs !== 0) {
    const at = (Date.now() - ageMs) / 1000;
    utimesSync(path, at, at);
  }
  return path;
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

describe('Ops/Admin projection baseline transfer contract', () => {
  it('requires distinct Core source and isolated Ops/Admin target URLs', () => {
    expect(validateOpsAdminBaselineDatabaseUrls(SOURCE, TARGET)).toEqual({
      sourceDatabaseName: 'blujet',
      targetDatabaseName: 'blujet_ops_admin',
    });
    expect(() => validateOpsAdminBaselineDatabaseUrls(SOURCE, SOURCE)).toThrow(
      'must be different databases',
    );
    expect(() => validateOpsAdminBaselineDatabaseUrls(TARGET, TARGET)).toThrow(
      'must be different databases',
    );
    expect(() => validateOpsAdminBaselineDatabaseUrls(TARGET, SOURCE)).toThrow(
      'must be the Core cartable database',
    );
    expect(() =>
      validateOpsAdminBaselineDatabaseUrls(
        SOURCE,
        'postgresql://owner:secret@localhost:5432/blujet_loyalty',
      ),
    ).toThrow('isolated Ops/Admin database');
    expect(() =>
      validateOpsAdminBaselineDatabaseUrls('mysql://db/blujet', TARGET),
    ).toThrow('must be PostgreSQL');
  });

  it('never copies content columns onto the projection contract', () => {
    expect(OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS).toEqual([
      'id',
      'assigneeId',
      'category',
      'sourceType',
      'sourceId',
      'status',
      'resolvedAt',
      'readAt',
      'taskVersion',
      'auditId',
      'fingerprint',
      'createdAt',
    ]);
    for (const column of OPS_ADMIN_BASELINE_FORBIDDEN_SOURCE_COLUMNS) {
      expect(OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS).not.toContain(column);
    }
  });

  it('rejects missing, empty, stale, symlink and checksum-mismatched backups', () => {
    expect(() =>
      validateOpsAdminBaselineOptions({ apply: true, batchSize: 100 }),
    ).toThrow('verified backup artifact');
    expect(() =>
      validateOpsAdminBaselineBackupArtifact({
        backupPath: join(tmpdir(), 'missing-ops-admin-backup.dump'),
        expectedSha256: 'a'.repeat(64),
      }),
    ).toThrow('missing');
    const empty = backupFile('');
    expect(() =>
      validateOpsAdminBaselineBackupArtifact({
        backupPath: empty,
        expectedSha256: sha256(''),
      }),
    ).toThrow('empty');
    const stale = backupFile('payload', 25 * 60 * 60 * 1000);
    expect(() =>
      validateOpsAdminBaselineBackupArtifact({
        backupPath: stale,
        expectedSha256: sha256('payload'),
      }),
    ).toThrow('stale');
    const dir = mkdtempSync(join(tmpdir(), 'ops-admin-baseline-dir-'));
    const target = backupFile('payload');
    const link = join(dir, 'backup.link');
    try {
      symlinkSync(target, link);
      expect(() =>
        validateOpsAdminBaselineBackupArtifact({
          backupPath: link,
          expectedSha256: sha256('payload'),
        }),
      ).toThrow('invalid');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Ops/Admin baseline backup artifact is invalid'
      ) {
        throw error;
      }
      mkdirSync(join(dir, 'not-a-file'));
      expect(() =>
        validateOpsAdminBaselineBackupArtifact({
          backupPath: join(dir, 'not-a-file'),
          expectedSha256: sha256('payload'),
        }),
      ).toThrow('invalid');
    }
    const fresh = backupFile('payload');
    expect(() =>
      validateOpsAdminBaselineBackupArtifact({
        backupPath: fresh,
        expectedSha256: 'b'.repeat(64),
      }),
    ).toThrow('does not match');
    expect(() =>
      validateOpsAdminBaselineBackupArtifact({
        backupPath: fresh,
        expectedSha256: 'not-a-hash',
      }),
    ).toThrow('checksum is invalid');
    expect(() =>
      validateOpsAdminBaselineBackupArtifact({
        backupPath: fresh,
        expectedSha256: sha256('payload'),
      }),
    ).not.toThrow();
  });

  it('does not leak backup paths, URLs or credentials in validation errors', () => {
    const secretPath = join(tmpdir(), 'secret-backup-path-do-not-print.dump');
    try {
      validateOpsAdminBaselineBackupArtifact({
        backupPath: secretPath,
        expectedSha256: 'a'.repeat(64),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secretPath);
      expect(message).not.toMatch(/postgresql:\/\//i);
      expect(message).not.toContain('secret');
    }
    try {
      validateOpsAdminBaselineDatabaseUrls(
        'postgresql://owner:hunter2@localhost:5432/blujet_ops_admin',
        TARGET,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('hunter2');
      expect(message).not.toMatch(/postgresql:\/\//i);
    }
  });

  it('emits two independently ordered SHA-256 aggregates and sanitized PASS/FAIL', () => {
    const earlier = new Date('2026-01-01T00:00:00.000Z');
    const later = new Date('2026-02-01T00:00:00.000Z');
    const rows = [
      {
        id: 'b',
        assigneeId: 'user-2',
        category: 'ADMIN',
        sourceType: null,
        sourceId: null,
        status: 'OPEN',
        resolvedAt: null,
        readAt: null,
        taskVersion: 1,
        auditId: null,
        fingerprint: null,
        createdAt: earlier,
      },
      {
        id: 'a',
        assigneeId: 'user-1',
        category: 'AGENCY',
        sourceType: 'AGENCY_REQUEST',
        sourceId: 'src-1',
        status: 'OPEN',
        resolvedAt: null,
        readAt: null,
        taskVersion: 2,
        auditId: null,
        fingerprint: null,
        createdAt: later,
      },
    ] as const;
    const fingerprint = fingerprintProjectionRows([...rows]);
    expect(fingerprint.count).toBe('2');
    expect(fingerprint.hashA).toHaveLength(64);
    expect(fingerprint.hashB).toHaveLength(64);
    expect(fingerprint.hashA).not.toBe(fingerprint.hashB);
    expect(fingerprint.hashA).toBe(
      sha256Hex([encodeForTest(rows[1]), encodeForTest(rows[0])].join('\n')),
    );
    const pass = buildOpsAdminBaselineReport(
      'transfer',
      fingerprint,
      fingerprint,
    );
    expect(pass.status).toBe('PASS');
    const serialized = serializeOpsAdminBaselineReport(pass);
    expect(serialized).not.toContain('user-1');
    expect(serialized).not.toContain('src-1');
    expect(serialized).not.toContain('title');
    expect(JSON.parse(serialized)).toEqual({
      status: 'PASS',
      mode: 'transfer',
      sourceCount: '2',
      targetCount: '2',
      sourceHashA: fingerprint.hashA,
      targetHashA: fingerprint.hashA,
      sourceHashB: fingerprint.hashB,
      targetHashB: fingerprint.hashB,
    });
    const fail = buildOpsAdminBaselineReport('reconcile', fingerprint, {
      ...fingerprint,
      count: '1',
    });
    expect(fail.status).toBe('FAIL');
  });
});

function encodeForTest(row: {
  id: string;
  assigneeId: string;
  category: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string;
  resolvedAt: Date | null;
  readAt: Date | null;
  taskVersion: number | null;
  auditId: string | null;
  fingerprint: string | null;
  createdAt: Date;
}): string {
  return [
    row.id,
    row.assigneeId,
    row.category,
    row.sourceType ?? '',
    row.sourceId ?? '',
    row.status,
    '',
    '',
    String(row.taskVersion ?? ''),
    '',
    '',
    row.createdAt.toISOString(),
  ].join('\u001f');
}
