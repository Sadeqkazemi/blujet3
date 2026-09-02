import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
  Req,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  SkipThrottle,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Request } from 'express';
import { IsString } from 'class-validator';
import { configureGateway } from './configure-gateway';
import {
  authIdentityTracker,
  ipTracker,
  isSensitiveAuth,
  sensitiveAuthLimit,
} from './throttling';
import { serializeLogRequest } from './structured-logging';

class ProbeBodyDto {
  @IsString()
  value: string;
}

@Controller('gateway-probe')
class GatewayProbeController {
  @Get()
  probe() {
    return { success: true, data: { reachable: true } };
  }

  @Get('ip')
  ip(@Req() req: Request) {
    return { success: true, data: { realIp: req.ip, protocol: req.protocol } };
  }

  @Get('slow')
  async slow() {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { success: true };
  }

  @Get('explode')
  explode(): never {
    throw new Error('sensitive stack detail');
  }

  @Post('body')
  body(@Body() body: ProbeBodyDto) {
    return { success: true, data: body };
  }
}

@Controller('auth')
class GatewayAuthProbeController {
  @Post('otp/request')
  otp() {
    return { success: true, data: { accepted: true } };
  }

  @Post('staff/login')
  login() {
    return { success: true, data: { accepted: true } };
  }
}

@Controller('health')
@SkipThrottle({
  default: true,
  sensitiveIp: true,
  sensitiveIdentity: true,
})
class GatewayHealthProbeController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 5, getTracker: ipTracker },
        {
          name: 'sensitiveIp',
          ttl: 60_000,
          limit: sensitiveAuthLimit,
          skipIf: (context) => !isSensitiveAuth(context),
          getTracker: ipTracker,
        },
        {
          name: 'sensitiveIdentity',
          ttl: 60_000,
          limit: sensitiveAuthLimit,
          skipIf: (context) => !isSensitiveAuth(context),
          getTracker: authIdentityTracker,
        },
      ],
    }),
  ],
  controllers: [
    GatewayProbeController,
    GatewayAuthProbeController,
    GatewayHealthProbeController,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class GatewayTestModule {}

describe('API Gateway integration', () => {
  let app: NestExpressApplication & INestApplication<App>;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.API_REQUEST_TIMEOUT_MS = '25';
    process.env.API_MAX_BODY_BYTES = '128';
    process.env.HTTPS_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayTestModule],
    }).compile();
    app = moduleRef.createNestApplication<
      NestExpressApplication & INestApplication<App>
    >({
      bufferLogs: true,
      bodyParser: false,
      rawBody: true,
    });
    configureGateway(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...originalEnv };
  });

  it('allow-lists structured request fields and drops query/body/header secrets', () => {
    const serialized = serializeLogRequest({
      id: 'trace-1',
      method: 'POST',
      url: '/ignored',
      raw: { originalUrl: '/auth/login?token=secret', ip: '203.0.113.8' },
      headers: { authorization: 'Bearer secret' },
      body: { password: 'secret', otp: '123456' },
    });
    expect(serialized).toEqual({
      id: 'trace-1',
      method: 'POST',
      url: '/auth/login',
      realIp: '203.0.113.8',
    });
    expect(JSON.stringify(serialized)).not.toContain('secret');
    expect(JSON.stringify(serialized)).not.toContain('123456');
  });

  it('serves canonical v1 and legacy aliases with identical behavior', async () => {
    const [versioned, legacy] = await Promise.all([
      request(app.getHttpServer()).get('/api/v1/gateway-probe'),
      request(app.getHttpServer()).get('/gateway-probe'),
    ]);
    expect(versioned.status).toBe(200);
    expect(versioned.body).toEqual(legacy.body);
  });

  it('propagates safe request IDs and replaces unsafe ones', async () => {
    const safe = await request(app.getHttpServer())
      .get('/api/v1/gateway-probe')
      .set('X-Request-Id', 'client:trace-123');
    expect(safe.headers['x-request-id']).toBe('client:trace-123');

    const unsafe = await request(app.getHttpServer())
      .get('/gateway-probe')
      .set('X-Request-Id', 'bad request id');
    expect(unsafe.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('uses forwarded client IP and protocol only through the trusted hop', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/gateway-probe/ip')
      .set('X-Forwarded-For', '203.0.113.42')
      .set('X-Forwarded-Proto', 'https');
    const body = response.body as unknown as {
      data: { realIp: string; protocol: string };
    };
    expect(body.data).toEqual({
      realIp: '203.0.113.42',
      protocol: 'https',
    });
  });

  it('adds security headers without HSTS on an HTTP deployment', async () => {
    const response = await request(app.getHttpServer()).get('/gateway-probe');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('returns unified envelopes for timeout, oversized body, and 500 errors', async () => {
    const timeoutResponse = await request(app.getHttpServer()).get(
      '/api/v1/gateway-probe/slow',
    );
    expect(timeoutResponse.status).toBe(504);
    const timeoutBody = timeoutResponse.body as unknown as {
      error: { code: string };
    };
    expect(timeoutBody.error.code).toBe('REQUEST_TIMEOUT');

    const oversized = await request(app.getHttpServer())
      .post('/gateway-probe/body')
      .send({ value: 'x'.repeat(256) });
    expect(oversized.status).toBe(413);
    const oversizedBody = oversized.body as unknown as {
      error: { code: string };
    };
    expect(oversizedBody.error.code).toBe('PAYLOAD_TOO_LARGE');

    const unexpected = await request(app.getHttpServer()).get(
      '/gateway-probe/explode',
    );
    expect(unexpected.status).toBe(500);
    const unexpectedBody = unexpected.body as unknown as {
      error: { code: string };
    };
    expect(unexpectedBody.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(unexpected.body)).not.toContain(
      'sensitive stack detail',
    );

    const invalid = await request(app.getHttpServer())
      .post('/gateway-probe/body')
      .send({ value: 42 });
    expect(invalid.status).toBe(400);
    expect(
      (invalid.body as unknown as { error: { code: string } }).error.code,
    ).toBe('VALIDATION_FAILED');

    const missing = await request(app.getHttpServer()).get('/api/v1/missing');
    expect(missing.status).toBe(404);
    expect(
      (missing.body as unknown as { error: { code: string } }).error.code,
    ).toBe('NOT_FOUND');
  });

  it('enforces OTP limits per identity even when the forwarded IP changes', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .set('X-Forwarded-For', `198.51.100.${attempt + 1}`)
        .send({ phone: '09120000000' });
      expect(response.status).toBe(201);
    }
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .set('X-Forwarded-For', '198.51.100.99')
      .send({ phone: '09120000000' });
    expect(blocked.status).toBe(429);
    const blockedBody = blocked.body as unknown as {
      error: { code: string };
    };
    expect(blockedBody.error.code).toBe('RATE_LIMITED');
  });

  it('enforces the stricter login limit per identity', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/auth/staff/login')
        .set('X-Forwarded-For', `203.0.113.${attempt + 1}`)
        .send({ username: 'finance', password: 'invalid' });
      expect(response.status).toBe(201);
    }
    const blocked = await request(app.getHttpServer())
      .post('/auth/staff/login')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ username: 'finance', password: 'invalid' });
    expect(blocked.status).toBe(429);
    const blockedBody = blocked.body as unknown as {
      error: { code: string };
    };
    expect(blockedBody.error.code).toBe('RATE_LIMITED');
  });

  it('keeps both health aliases exempt from throttling', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const path = attempt % 2 === 0 ? '/health' : '/api/v1/health';
      const response = await request(app.getHttpServer()).get(path);
      expect(response.status).toBe(200);
    }
  });

  it('applies the general limit to ordinary routes by resolved IP', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app.getHttpServer()).get('/gateway-probe');
      expect(response.status).toBe(200);
    }
    const blocked = await request(app.getHttpServer()).get('/gateway-probe');
    expect(blocked.status).toBe(429);
    const blockedBody = blocked.body as unknown as {
      error: { code: string };
    };
    expect(blockedBody.error.code).toBe('RATE_LIMITED');
  });
});
