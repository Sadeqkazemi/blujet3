import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serializeCoreItinerarySchemaBundle } from '../src/common/events/core-itinerary-json-schemas';

const artifactPath = resolve(
  __dirname,
  '../../docs/events/schema-registry/core-itinerary-v1.json',
);
const expected = serializeCoreItinerarySchemaBundle();
const actual = readFileSync(artifactPath, 'utf8');
if (actual !== expected) {
  process.stderr.write(
    `Event Schema Registry artifact is stale: ${artifactPath}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Event Schema Registry artifact verified: ${artifactPath}\n`,
  );
}
