import { BadRequestException } from '@nestjs/common';
import type { AgencyPortalService } from '../agency-portal/agency-portal.service';
import type { BookingService } from '../booking-engine/booking.service';
import type { SearchService } from '../booking-engine/search.service';
import { AgencyApiScope, CabinClass, Role } from '../../database/enums';
import { PartnerApiController } from './partner-api.controller';
import type { PartnerApiContext } from './partner-api-key.guard';

describe('PartnerApiController', () => {
  const search = { search: jest.fn(), seatMap: jest.fn() };
  const bookings = {
    createAgencyAllotmentBooking: jest.fn(),
    getAgencyBooking: jest.fn(),
  };
  const portal = { credit: jest.fn(), allotments: jest.fn() };
  const controller = new PartnerApiController(
    search as unknown as SearchService,
    bookings as unknown as BookingService,
    portal as unknown as AgencyPortalService,
  );
  const partner: PartnerApiContext = {
    keyId: 'key-1',
    scope: AgencyApiScope.SEARCH_BOOK,
    actor: { id: 'agency-1', role: Role.AGENCY, fullName: 'Agency One' },
  };

  beforeEach(() => jest.clearAllMocks());

  it('requires an idempotency key before creating a booking', async () => {
    await expect(
      controller.book(
        partner,
        {
          allotmentId: 'allotment-1',
          cabin: CabinClass.ECONOMY,
          passengers: [],
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bookings.createAgencyAllotmentBooking).not.toHaveBeenCalled();
  });

  it('delegates agency booking to the transactional allotment engine', async () => {
    const passengers = [
      {
        fullName: 'Ali Rezaei',
        passengerType: 'ADULT' as const,
        birthDate: '1990-01-01',
        seatCode: '4A',
      },
    ];
    bookings.createAgencyAllotmentBooking.mockResolvedValue({ pnr: 'ABC123' });

    const result = await controller.book(
      partner,
      {
        allotmentId: 'allotment-1',
        cabin: CabinClass.ECONOMY,
        passengers,
      },
      'request-1',
    );

    expect(bookings.createAgencyAllotmentBooking).toHaveBeenCalledWith(
      partner.actor,
      'allotment-1',
      { cabin: CabinClass.ECONOMY, passengers },
      'request-1',
    );
    expect(result).toEqual({ success: true, data: { pnr: 'ABC123' } });
  });

  it('returns only the authenticated agency allotments', async () => {
    portal.allotments.mockResolvedValue([{ id: 'allotment-1' }]);
    await expect(controller.allotments(partner)).resolves.toEqual({
      success: true,
      data: [{ id: 'allotment-1' }],
    });
    expect(portal.allotments).toHaveBeenCalledWith(partner.actor);
  });
});
