import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Destination stats (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ bufferLogs: true });
    const logger = app.get(Logger);
    app.useLogger(logger);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns non-hardcoded counts (zeros allowed)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/site-content/destination-stats',
    );
    expect(res.status).toBe(200);
    const d = res.body.data as {
      activeDestinations: number;
      domesticDestinations: number;
      internationalDestinations: number;
    };
    expect(typeof d.activeDestinations).toBe('number');
    expect(d.activeDestinations).toBe(
      d.domesticDestinations + d.internationalDestinations,
    );
    expect(d.activeDestinations).not.toBe(12);
    expect(d.activeDestinations).toBeLessThan(200);
    expect(d.domesticDestinations).toBeGreaterThanOrEqual(0);
    expect(d.internationalDestinations).toBeGreaterThanOrEqual(0);
  });
});
