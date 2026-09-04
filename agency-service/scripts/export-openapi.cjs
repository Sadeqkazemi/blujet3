// Schema generation only: no database, network or business operation is invoked.
require('reflect-metadata');
process.env.NODE_ENV = 'test';
process.env.PORT = '3600';
process.env.AGENCY_DATABASE_URL = 'postgresql://localhost/schema_only';
process.env.AGENCY_INTERNAL_TOKEN =
  'schema-only-token-not-a-runtime-credential';
const { Test } = require('@nestjs/testing');
const { DataSource } = require('typeorm');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { AppModule } = require('../dist/app.module');

async function exportSchema() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource)
    .useValue({ isInitialized: false })
    .compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.init();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Blujet internal Agency read API')
        .setVersion('0.1.0')
        .addApiKey(
          { type: 'apiKey', in: 'header', name: 'X-Internal-Token' },
          'internal',
        )
        .build(),
    );
    const directory = resolve(__dirname, '../docs');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, 'openapi.json'),
      JSON.stringify(document, null, 2) + '\n',
    );
  } finally {
    await app.close();
  }
}
void exportSchema().catch(() => {
  process.stderr.write(
    'Agency OpenAPI export failed. Build the service first.\n',
  );
  process.exitCode = 1;
});
