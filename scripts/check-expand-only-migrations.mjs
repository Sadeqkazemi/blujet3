import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseRevision = process.argv[2];
if (!baseRevision) {
  process.stderr.write('Usage: node scripts/check-expand-only-migrations.mjs <base-revision>\n');
  process.exit(2);
}

const migrationRoot = 'backend/src/database/migrations/';
const changes = execFileSync(
  'git',
  ['diff', '--name-status', `${baseRevision}...HEAD`, '--', migrationRoot],
  { encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const destructiveUpPatterns = [
  /\.drop(?:Table|Column|Columns|Index|UniqueConstraint|ForeignKey)\s*\(/i,
  /\.rename(?:Table|Column)\s*\(/i,
  /\bDROP\s+(?:TABLE|COLUMN|SCHEMA|TYPE|INDEX|CONSTRAINT)\b/i,
  /\bTRUNCATE\b/i,
  /\bRENAME\s+(?:TABLE|COLUMN)\b/i,
  /\bALTER\s+(?:TABLE\s+[^;]+\s+)?COLUMN\s+[^;]+\s+TYPE\b/i,
];

const violations = [];
for (const change of changes) {
  const [status, path] = change.split(/\s+/, 2);
  if (status !== 'A') {
    violations.push(`${path}: existing migration is ${status === 'D' ? 'deleted' : 'modified'}`);
    continue;
  }

  const source = readFileSync(path, 'utf8');
  const upStart = source.search(/\basync\s+up\s*\(/);
  const downStart = source.search(/\basync\s+down\s*\(/);
  if (upStart < 0 || downStart <= upStart) {
    violations.push(`${path}: cannot isolate up() from down()`);
    continue;
  }

  const upSource = source.slice(upStart, downStart);
  for (const pattern of destructiveUpPatterns) {
    if (pattern.test(upSource)) {
      violations.push(`${path}: destructive operation in up() matches ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `Phase-0 expand-only migration gate failed:\n${violations
      .map((violation) => `- ${violation}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Expand-only migration gate passed (${changes.length} migration change(s)).\n`,
);
