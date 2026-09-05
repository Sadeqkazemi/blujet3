import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Per-run fixture secrets only; never changes the machine trust store. */
export class LocalKafkaSecurity {
  readonly username = `fixture-${randomBytes(8).toString('hex')}`;
  readonly password = randomBytes(32).toString('hex');
  private readonly storePassword = randomBytes(32).toString('hex');
  ca = '';

  constructor(private readonly directory: string) {}

  async generate(java: string): Promise<void> {
    const keytool = join(
      dirname(java),
      process.platform === 'win32' ? 'keytool.exe' : 'keytool',
    );
    const common = [
      '-keystore',
      join(this.directory, 'broker.p12'),
      '-storetype',
      'PKCS12',
      '-storepass:env',
      'BLUJET_TEST_STORE_PASSWORD',
    ];
    const options = {
      timeout: 30000,
      windowsHide: true,
      env: { ...process.env, BLUJET_TEST_STORE_PASSWORD: this.storePassword },
    };
    try {
      await execute(
        keytool,
        [
          '-genkeypair',
          '-alias',
          'broker',
          '-keyalg',
          'RSA',
          '-keysize',
          '2048',
          '-sigalg',
          'SHA256withRSA',
          '-validity',
          '2',
          '-dname',
          'CN=fixture.invalid',
          '-ext',
          'SAN=IP:127.0.0.1',
          ...common,
        ],
        options,
      );
      await chmod(join(this.directory, 'broker.p12'), 0o600);
      const exported = await execute(
        keytool,
        ['-exportcert', '-rfc', '-alias', 'broker', ...common],
        options,
      );
      this.ca = exported.stdout;
    } catch {
      // Child-process errors include command arguments; never expose secrets.
      throw new Error('Kafka fixture certificate generation failed');
    }
  }

  properties(): string[] {
    const store = join(this.directory, 'broker.p12').replaceAll('\\', '/');
    return [
      `ssl.keystore.location=${store}`,
      'ssl.keystore.type=PKCS12',
      `ssl.keystore.password=${this.storePassword}`,
      `ssl.key.password=${this.storePassword}`,
      `ssl.truststore.location=${store}`,
      'ssl.truststore.type=PKCS12',
      `ssl.truststore.password=${this.storePassword}`,
      'sasl.enabled.mechanisms=SCRAM-SHA-256,SCRAM-SHA-512',
      'sasl.mechanism.inter.broker.protocol=SCRAM-SHA-256',
      ...['scram-sha-256', 'scram-sha-512'].map(
        (mechanism) =>
          `listener.name.client.${mechanism}.sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="${this.username}" password="${this.password}";`,
      ),
    ];
  }

  formatArgs(): string[] {
    return ['SCRAM-SHA-256', 'SCRAM-SHA-512'].flatMap((mechanism) => [
      '--add-scram',
      `${mechanism}=[name=${this.username},password=${this.password}]`,
    ]);
  }

  async cleanup(): Promise<void> {
    // Exact fixture files only. Broker data/logs remain for diagnostics.
    await Promise.all(
      ['broker.p12', 'server.properties'].map((name) =>
        rm(join(this.directory, name), { force: true }),
      ),
    );
  }
}
