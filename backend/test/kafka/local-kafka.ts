import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, createConnection } from 'node:net';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No loopback port');
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  return address.port;
}

async function listening(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (ready: boolean) => {
      socket.destroy();
      done(ready);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

/** Owns exactly one disposable child process, never an existing broker. */
export class LocalKafka {
  private child?: ChildProcess;
  private exited?: Promise<void>;
  private constructor(
    readonly directory: string,
    readonly port: number,
    private readonly java: string,
    private readonly classpath: string,
  ) {}

  static async create(): Promise<LocalKafka> {
    const java = process.env.KAFKA_TEST_JAVA;
    const home = process.env.KAFKA_TEST_HOME;
    if (!java || !home)
      throw new Error(
        'KAFKA_TEST_JAVA and KAFKA_TEST_HOME are required; real broker tests never silently skip',
      );
    await access(java);
    await access(join(home, 'libs', 'kafka_2.13-3.9.1.jar'));
    const directory = await mkdtemp(join(tmpdir(), 'blujet-kafka-'));
    const port = await reservePort();
    let controllerPort = await reservePort();
    while (controllerPort === port) controllerPort = await reservePort();
    const broker = new LocalKafka(
      directory,
      port,
      resolve(java),
      join(resolve(home), 'libs', '*'),
    );
    await writeFile(
      join(directory, 'log4j.properties'),
      'log4j.rootLogger=WARN, stderr\nlog4j.appender.stderr=org.apache.log4j.ConsoleAppender\nlog4j.appender.stderr.layout=org.apache.log4j.PatternLayout\nlog4j.appender.stderr.layout.ConversionPattern=%p %m%n\n',
    );
    await writeFile(
      join(directory, 'server.properties'),
      [
        'process.roles=broker,controller',
        'node.id=1',
        `controller.quorum.voters=1@127.0.0.1:${controllerPort}`,
        `listeners=PLAINTEXT://127.0.0.1:${port},CONTROLLER://127.0.0.1:${controllerPort}`,
        `advertised.listeners=PLAINTEXT://127.0.0.1:${port}`,
        'controller.listener.names=CONTROLLER',
        'listener.security.protocol.map=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT',
        'inter.broker.listener.name=PLAINTEXT',
        `log.dirs=${join(directory, 'data').replaceAll('\\', '/')}`,
        'offsets.topic.replication.factor=1',
        'transaction.state.log.replication.factor=1',
        'transaction.state.log.min.isr=1',
        'group.initial.rebalance.delay.ms=0',
        'auto.create.topics.enable=false',
        'num.partitions=1',
        'log.cleaner.enable=false',
        'num.network.threads=2',
        'num.io.threads=2',
      ].join('\n'),
    );
    const generated = await broker.tool('random-uuid');
    const id = generated.stdout.trim();
    if (!/^[A-Za-z0-9_-]{22}$/.test(id))
      throw new Error('Invalid generated Kafka cluster ID');
    await broker.tool(
      'format',
      '-t',
      id,
      '-c',
      join(directory, 'server.properties'),
    );
    return broker;
  }

  private args(): string[] {
    return [
      '-Xms128m',
      '-Xmx384m',
      '-Duser.timezone=UTC',
      `-Dlog4j.configuration=${pathToFileURL(join(this.directory, 'log4j.properties')).href}`,
      '-cp',
      this.classpath,
    ];
  }
  private tool(...args: string[]) {
    return execute(
      this.java,
      [...this.args(), 'kafka.tools.StorageTool', ...args],
      { timeout: 45000, windowsHide: true },
    );
  }

  async start(): Promise<void> {
    if (this.child) throw new Error('Test broker already started');
    const log = createWriteStream(join(this.directory, 'broker.log'), {
      flags: 'a',
    });
    const child = spawn(
      this.java,
      [
        ...this.args(),
        'kafka.Kafka',
        join(this.directory, 'server.properties'),
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.child = child;
    this.exited = new Promise<void>((done) => {
      child.once('error', () => done());
      child.once('exit', () => done());
    }).finally(() => {
      log.end();
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      if (await listening(this.port)) return;
      await delay(200);
    }
    await this.stop();
    throw new Error(
      `Local Kafka failed to start; inspect ${join(this.directory, 'broker.log')}`,
    );
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    // Deliberately exercises a crash/restart, and only this test's own PID.
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await this.exited;
    this.child = undefined;
    if (await listening(this.port))
      throw new Error('Test broker port remained open');
  }
}
