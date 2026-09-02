import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { loginAs } from './login.helper';

/** DRAFT → PENDING_OPERATIONS → PENDING_CEO (ops approve). */
export async function advanceToPendingCeo(
  app: INestApplication<App>,
  flightInstanceId: string,
  commercialToken: string | null | undefined,
) {
  if (!commercialToken) {
    throw new Error('commercial token required for advanceToPendingCeo');
  }
  const submit = await request(app.getHttpServer())
    .post(`/flights/${flightInstanceId}/submit-operations`)
    .set('Authorization', `Bearer ${commercialToken}`)
    .send({});
  if (submit.status !== 200 && submit.status !== 201) {
    throw new Error(
      `submit-operations failed: ${submit.status} ${JSON.stringify(submit.body)}`,
    );
  }

  const { accessToken: opsToken } = await loginAs(app, 'ops');
  if (!opsToken) throw new Error('ops login failed');

  const decision = await request(app.getHttpServer())
    .post(`/flights/${flightInstanceId}/operations-decision`)
    .set('Authorization', `Bearer ${opsToken}`)
    .send({ decision: 'APPROVED', comment: 'تأیید عملیات برای تست' });
  if (decision.status !== 200 && decision.status !== 201) {
    throw new Error(
      `operations-decision failed: ${decision.status} ${JSON.stringify(decision.body)}`,
    );
  }
  return decision.body.data as unknown as {
    id: string;
    definitionStatus: string;
    version: number;
  };
}
