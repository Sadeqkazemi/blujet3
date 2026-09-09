import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertEventSchemaCompatibility } from '../src/common/events/event-schema-compatibility';

const baselineArgument = process.argv.indexOf('--baseline');
const baselinePath =
  baselineArgument >= 0
    ? process.argv[baselineArgument + 1]
    : process.argv.at(2);
if (!baselinePath) {
  process.stderr.write('A baseline event schema bundle is required.\n');
  process.exitCode = 1;
} else {
  try {
    const baseline = readFileSync(resolve(baselinePath), 'utf8');
    const proposed = readFileSync(
      resolve(
        __dirname,
        '../../docs/events/schema-registry/core-itinerary-v1.json',
      ),
      'utf8',
    );
    assertEventSchemaCompatibility(baseline, proposed);
    process.stdout.write('Event schema compatibility verified.\n');
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Event schema compatibility verification failed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
