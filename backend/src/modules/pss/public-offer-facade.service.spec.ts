import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreOfferService } from './core-offer.service';
import { PublicOfferFacadeService } from './public-offer-facade.service';
import type { PublicOfferSearchDto } from './dto/public-offer-search.dto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const AGENCY_ID = '22222222-2222-4222-8222-222222222222';
const request: PublicOfferSearchDto = {
  segments: [
    {
      flightInstanceId: '33333333-3333-4333-8333-333333333333',
      sequence: 1,
      cabin: 'ECONOMY',
    },
  ],
  travellers: [{ passengerType: 'ADULT', birthDate: '1990-01-01' }],
};

describe('PublicOfferFacadeService', () => {
  const search = jest.fn();
  const configGet = jest.fn();
  const service = new PublicOfferFacadeService(
    { search } as unknown as CoreOfferService,
    { get: configGet } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configGet.mockReturnValue('true');
    search.mockResolvedValue({ offerId: 'offer-id' });
  });

  it('fails closed before invoking Core when the flag is absent', async () => {
    configGet.mockReturnValue(undefined);
    await expect(
      service.search({ id: USER_ID, role: 'USER', fullName: 'User' }, request),
    ).rejects.toMatchObject({ response: { code: 'OFFER_UNAVAILABLE' } });
    expect(search).not.toHaveBeenCalled();
  });

  it('binds USER to SYSTEM and the JWT subject', async () => {
    const actor: AuthenticatedUser = {
      id: USER_ID,
      role: 'USER',
      fullName: 'User',
    };
    await service.search(actor, request);
    expect(search).toHaveBeenCalledWith({
      channel: 'SYSTEM',
      seller: { type: 'USER', id: USER_ID },
      segments: request.segments,
      travellers: request.travellers,
    });
  });

  it('binds AGENCY to the AGENCY channel and JWT subject', async () => {
    const actor: AuthenticatedUser = {
      id: AGENCY_ID,
      role: 'AGENCY',
      fullName: 'Agency',
    };
    await service.search(actor, request);
    expect(search).toHaveBeenCalledWith({
      channel: 'AGENCY',
      seller: { type: 'AGENCY', id: AGENCY_ID },
      segments: request.segments,
      travellers: request.travellers,
    });
  });

  it('rejects staff identities even if called outside the guarded controller', async () => {
    await expect(
      service.search(
        { id: USER_ID, role: 'EMPLOYEE', fullName: 'Staff' },
        request,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(search).not.toHaveBeenCalled();
  });

  it('returns the Core signed Offer unchanged', async () => {
    const result = { offerId: 'offer-id', integrityToken: 'opaque' };
    search.mockResolvedValue(result);
    await expect(
      service.search({ id: USER_ID, role: 'USER', fullName: 'User' }, request),
    ).resolves.toBe(result);
  });
});
