import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Use the parser already installed by backend npm ci; no new dependency.
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { load } = require('js-yaml');
const workflow = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const job = () => {
  assert.ok(workflow.jobs['backend-kafka'], 'real Kafka must have a CI job');
  return workflow.jobs['backend-kafka'];
};

test('broker job runs for backend changes and is required by CI gate', () => {
  assert.equal(job().needs, 'changes');
  assert.equal(job().if, "needs.changes.outputs.backend == 'true'");
  assert.ok(workflow.jobs['ci-gate'].needs.includes('backend-kafka'));
  const selector = workflow.jobs.changes.steps.find(step => step.id === 'scope').run;
  assert.ok(selector.includes('scripts/kafka-ci'));
  assert.ok('workflow_call' in workflow.on);
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);
});

test('broker tests own a PostgreSQL test service and have bounded runtime', () => {
  const kafka = job();
  assert.equal(kafka.services.postgres.image, 'postgres:16-alpine');
  assert.equal(kafka.services.postgres.env.POSTGRES_DB, 'blujet_test');
  assert.ok(kafka['timeout-minutes'] <= 15);
  assert.equal(kafka['continue-on-error'], undefined);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  for (const step of kafka.steps) assert.equal(step['continue-on-error'], undefined);
  assert.doesNotMatch(JSON.stringify(kafka), /secrets\.|ssh|deploy\.yml/);
});

test('Java and Kafka bootstrap are pinned and checksum precedes extraction', () => {
  const steps = job().steps;
  const java = steps.find(step => step.uses?.startsWith('actions/setup-java@'));
  assert.match(java.uses, /@[a-f0-9]{40}$/);
  assert.equal(java.with.distribution, 'temurin');
  assert.equal(java.with['java-version'], '21');
  const install = steps.find(step => step.name === 'Prepare verified Kafka').run;
  assert.ok(install.includes('https://archive.apache.org/dist/kafka/3.9.1/kafka_2.13-3.9.1.tgz'));
  assert.match(install, /[a-f0-9]{128}/);
  assert.match(install, /curl --fail.*--max-time/);
  assert.ok(install.indexOf('sha512sum --check') < install.indexOf('tar -xzf'));
  assert.match(install, /set -euo pipefail/);
});

test('existing real-broker suite and workflow tests execute without forced success', () => {
  const runs = job().steps.map(step => step.run ?? '').join('\n');
  assert.match(runs, /node scripts\/kafka-ci\.test\.mjs/);
  assert.match(runs, /npm run test:kafka/);
  assert.doesNotMatch(runs, /\|\| true|--forceExit|--passWithNoTests/);
  const diagnostics = job().steps.find(step => step.name === 'Show fixture broker diagnostics');
  assert.equal(diagnostics.if, 'failure()');
  assert.match(diagnostics.run, /broker\.log/);
  assert.match(diagnostics.run, /tail -n 100/);
  assert.doesNotMatch(diagnostics.run, /\.env|pg_dump/);
});
