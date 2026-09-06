import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../errors';
import type { NiraManifestPassenger } from './nira-provider.interface';

export interface NiraManifestRequest {
  schemaVersion: 'v1';
  correlationId: string;
  idempotencyKey: string;
  flightNo: string;
  departureAt: string;
  passengers: NiraManifestPassenger[];
}

export interface NiraManifestAcknowledgement {
  schemaVersion: 'v1';
  accepted: boolean;
  acknowledgementId: string | null;
  receivedAt: string;
  code: string | null;
}

function invalid(): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'قرارداد ارتباط با نیرا معتبر نیست.',
  });
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function passenger(value: unknown): value is NiraManifestPassenger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(',') === 'fullName,nationalId,seatCode' &&
    typeof record.fullName === 'string' &&
    record.fullName.trim() === record.fullName &&
    record.fullName.length > 0 &&
    record.fullName.length <= 160 &&
    (record.nationalId === null ||
      (typeof record.nationalId === 'string' &&
        /^[0-9]{10}$/.test(record.nationalId))) &&
    (record.seatCode === null ||
      (typeof record.seatCode === 'string' &&
        /^[A-Za-z0-9-]{1,8}$/.test(record.seatCode)))
  );
}

export function parseNiraManifestRequest(input: unknown): NiraManifestRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const request = input as Record<string, unknown>;
  if (
    Object.keys(request).sort().join(',') !==
      'correlationId,departureAt,flightNo,idempotencyKey,passengers,schemaVersion' ||
    request.schemaVersion !== 'v1' ||
    !identifier(request.correlationId) ||
    !identifier(request.idempotencyKey) ||
    typeof request.flightNo !== 'string' ||
    !/^[A-Z0-9]{2,3}-?[A-Z0-9]{1,6}$/.test(request.flightNo) ||
    !utc(request.departureAt) ||
    !Array.isArray(request.passengers) ||
    request.passengers.length < 1 ||
    request.passengers.length > 1000 ||
    !request.passengers.every(passenger)
  )
    invalid();
  return JSON.parse(JSON.stringify(input)) as NiraManifestRequest;
}

export function parseNiraManifestAcknowledgement(
  input: unknown,
): NiraManifestAcknowledgement {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const acknowledgement = input as Record<string, unknown>;
  if (
    Object.keys(acknowledgement).sort().join(',') !==
      'accepted,acknowledgementId,code,receivedAt,schemaVersion' ||
    acknowledgement.schemaVersion !== 'v1' ||
    typeof acknowledgement.accepted !== 'boolean' ||
    (acknowledgement.acknowledgementId !== null &&
      !identifier(acknowledgement.acknowledgementId)) ||
    !utc(acknowledgement.receivedAt) ||
    (acknowledgement.code !== null && !identifier(acknowledgement.code)) ||
    (acknowledgement.accepted && acknowledgement.acknowledgementId === null) ||
    (!acknowledgement.accepted && acknowledgement.code === null)
  )
    invalid();
  return JSON.parse(JSON.stringify(input)) as NiraManifestAcknowledgement;
}
