import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { normalizeIranPhone } from '../common/normalize-iran-phone';

const OTP_ISSUANCE_PATHS = new Set([
  '/auth/otp/request',
  '/auth/step-up/request',
  '/auth/staff/first-login/request',
  '/auth/agency/first-login/request',
  '/auth/agency/password-reset/request',
  '/auth/password-reset/email/request',
  '/agencies/requests/otp',
]);

const LOGIN_PATHS = new Set([
  '/auth/staff/login',
  '/auth/staff/login/verify',
  '/auth/agency/login',
  '/auth/agency/login/verify',
  '/auth/agency/password-reset/verify',
  '/auth/otp/verify',
  '/auth/customer/login-password',
  '/auth/password-reset/email/verify',
]);

function requestPath(context: ExecutionContext): string {
  const req = context.switchToHttp().getRequest<Request>();
  return req.path;
}

export function isSensitiveAuth(context: ExecutionContext): boolean {
  const path = requestPath(context);
  return OTP_ISSUANCE_PATHS.has(path) || LOGIN_PATHS.has(path);
}

export function sensitiveAuthLimit(context: ExecutionContext): number {
  return OTP_ISSUANCE_PATHS.has(requestPath(context)) ? 3 : 5;
}

function normalizeIdentity(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  return normalized ? normalized.slice(0, 160) : undefined;
}

function normalizedBodyIdentity(body: Record<string, unknown> | undefined) {
  if (typeof body?.phone === 'string') {
    return normalizeIranPhone(body.phone);
  }
  return (
    normalizeIdentity(body?.username) ??
    normalizeIdentity(body?.email) ??
    normalizeIdentity(body?.challengeId)
  );
}

export function authIdentityTracker(req: Record<string, unknown>): string {
  const body = req.body as Record<string, unknown> | undefined;
  const identity = normalizedBodyIdentity(body) ?? 'anonymous';
  const digest = createHash('sha256').update(identity).digest('hex');
  return `identity:${digest}`;
}

export function ipTracker(req: Record<string, unknown>): string {
  return `ip:${typeof req.ip === 'string' ? req.ip : 'unknown'}`;
}
