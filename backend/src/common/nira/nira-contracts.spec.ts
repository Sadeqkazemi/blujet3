import { BadRequestException } from '@nestjs/common';
import {
  parseNiraManifestAcknowledgement,
  parseNiraManifestRequest,
} from './nira-contracts';

const request = () => ({
  schemaVersion: 'v1',
  correlationId: 'request-1',
  idempotencyKey: 'manifest-1',
  flightNo: 'BJ-410',
  departureAt: '2026-09-06T10:00:00.000Z',
  passengers: [
    { fullName: 'Ali Test', nationalId: '0123456789', seatCode: '12A' },
  ],
});

describe('NIRA/DCS manifest boundary contract', () => {
  it('accepts a versioned bounded manifest and detaches caller data', () => {
    const input = request();
    const parsed = parseNiraManifestRequest(input);
    input.passengers[0].fullName = 'changed';
    expect(parsed).toMatchObject({ schemaVersion: 'v1', flightNo: 'BJ-410' });
    expect(parsed.passengers[0].fullName).toBe('Ali Test');
  });

  it.each([
    { schemaVersion: 'v2' },
    { correlationId: 'bad id' },
    { idempotencyKey: '' },
    { flightNo: 'BJ' },
    { flightNo: 'bj-410' },
    { departureAt: '2026-09-06T10:00:00Z' },
    { passengers: [] },
    {
      passengers: [
        { fullName: 'A', nationalId: null, seatCode: null, extra: true },
      ],
    },
    { passengers: [{ fullName: 'A', nationalId: '123', seatCode: null }] },
    { passengers: [{ fullName: 'A', nationalId: null, seatCode: 'seat 1' }] },
  ])('rejects malformed manifest (%#)', (change) => {
    expect(() => parseNiraManifestRequest({ ...request(), ...change })).toThrow(
      BadRequestException,
    );
  });

  it('accepts successful and rejected acknowledgements', () => {
    expect(
      parseNiraManifestAcknowledgement({
        schemaVersion: 'v1',
        accepted: true,
        acknowledgementId: 'ack-1',
        receivedAt: '2026-09-06T10:01:00.000Z',
        code: null,
      }).accepted,
    ).toBe(true);
    expect(
      parseNiraManifestAcknowledgement({
        schemaVersion: 'v1',
        accepted: false,
        acknowledgementId: null,
        receivedAt: '2026-09-06T10:01:00.000Z',
        code: 'INVALID_MANIFEST',
      }).code,
    ).toBe('INVALID_MANIFEST');
  });

  it.each([
    { accepted: true, acknowledgementId: null },
    { accepted: false, code: null },
    { acknowledgementId: 'bad id' },
    { receivedAt: '2026-09-06T10:01:00Z' },
    { code: 'bad code' },
    { schemaVersion: 'v2' },
  ])('rejects malformed acknowledgement (%#)', (change) => {
    expect(() =>
      parseNiraManifestAcknowledgement({
        schemaVersion: 'v1',
        accepted: true,
        acknowledgementId: 'ack-1',
        receivedAt: '2026-09-06T10:01:00.000Z',
        code: null,
        ...change,
      }),
    ).toThrow(BadRequestException);
  });
});
