import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { User } from '../../src/database/entities/user.entity';
import { TWO_FACTOR_PROVIDER } from '../../src/modules/auth/providers/two-factor-provider.interface';
import { MockTwoFactorProvider } from '../../src/modules/auth/providers/mock-two-factor.provider';

/** Drives the full username/password + 2FA flow for a seeded staff account. */
export async function loginAs(
  app: INestApplication<App>,
  username: string,
  password = 'Blujet@1404',
) {
  const dataSource = app.get(DataSource);
  const twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/staff/login')
    .send({ username, password });

  if (loginRes.status !== 200) {
    return { loginRes, verifyRes: null, accessToken: null as string | null };
  }

  const user = await dataSource
    .getRepository(User)
    .findOneByOrFail({ username });
  const code = twoFactor.getLastCode(user.id);
  if (!code) throw new Error(`No 2FA code recorded for ${username}`);

  const verifyRes = await request(app.getHttpServer())
    .post('/auth/staff/login/verify')
    .send({ challengeId: loginRes.body.data.challengeId, code });

  return {
    loginRes,
    verifyRes,
    accessToken: verifyRes.body?.data?.accessToken as string | undefined,
  };
}

/** Drives POST /auth/step-up/request for an already-logged-in actor and
 * reads the code back from the mock provider, returning the two fields
 * every step-up-gated endpoint expects on its body. */
export async function stepUpFor(
  app: INestApplication<App>,
  accessToken: string,
  username: string,
  scope:
    | 'ADMIN_ROLE_CHANGE'
    | 'API_KEY_ROTATE'
    | 'REFUND_PAYOUT'
    | 'PRICE_CAPACITY_CHANGE'
    | 'SESSION_REVOKE',
) {
  const dataSource = app.get(DataSource);
  const twoFactor = app.get<MockTwoFactorProvider>(TWO_FACTOR_PROVIDER);

  const requestRes = await request(app.getHttpServer())
    .post('/auth/step-up/request')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ scope });
  if (requestRes.status !== 200) {
    throw new Error(
      `step-up request failed for ${username}/${scope}: ${requestRes.status} ${JSON.stringify(requestRes.body)}`,
    );
  }

  const user = await dataSource
    .getRepository(User)
    .findOneByOrFail({ username });
  const code = twoFactor.getLastCode(user.id);
  if (!code) throw new Error(`No step-up code recorded for ${username}`);

  return {
    stepUpChallengeId: requestRes.body.data.challengeId as string,
    stepUpCode: code,
  };
}

/** Drives the full phone+OTP flow for a customer (find-or-create on
 * first call), returning a ready-to-use access token. */
export async function loginAsCustomer(
  app: INestApplication<App>,
  phone: string,
) {
  const requestRes = await request(app.getHttpServer())
    .post('/auth/otp/request')
    .send({ phone });
  if (requestRes.status !== 200) {
    throw new Error(`OTP request failed for ${phone}: ${requestRes.status}`);
  }
  const codeRes = await request(app.getHttpServer()).get(
    `/auth/_test/last-otp/${phone}`,
  );
  const verifyRes = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({
      challengeId: requestRes.body.data.challengeId,
      code: codeRes.body.data.code,
    });
  return {
    accessToken: verifyRes.body?.data?.accessToken as string | undefined,
    userId: verifyRes.body?.data?.user?.id as string | undefined,
  };
}
