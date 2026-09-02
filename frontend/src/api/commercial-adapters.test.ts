import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import {
  addCustomService,
  deleteCustomService,
  fetchOtherServices,
  fetchPublicAncillaryServices,
  fetchSeatServices,
  setOtherServicePrice,
  setSeatServicePrice,
  toggleOtherService,
  toggleSeatService,
} from './ancillary-services';
import {
  decideAggregateSeatRequest,
  fetchAggregateInvoices,
  fetchAggregateSeatRequests,
} from './agencies';

vi.mock('./http', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

const apiGetMock = vi.mocked(apiGet);
const apiPatchMock = vi.mocked(apiPatch);
const apiPostMock = vi.mocked(apiPost);
const apiDeleteMock = vi.mocked(apiDelete);

const LIST = {
  seatServices: [
    {
      key: 'seat-normal',
      titleFa: 'صندلی عادی',
      descriptionFa: '',
      priceIrr: '0',
      enabled: true,
    },
  ],
  otherServices: [
    {
      key: 'baggage',
      titleFa: 'بار اضافه',
      descriptionFa: '',
      priceIrr: '2000000',
      enabled: true,
      isCustom: false,
    },
  ],
};

describe('commercial manager API adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetchAggregateInvoices calls the cross-agency endpoint and keeps amount strings', async () => {
    apiGetMock.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNo: 'INV-1',
        agencyId: 'a1',
        agencyName: 'آژانس',
        descriptionFa: 'فاکتور آژانس',
        issuedAt: '2026-08-01T00:00:00.000Z',
        amountIrr: '150000000',
        status: 'UNPAID',
      },
    ]);
    const rows = await fetchAggregateInvoices('UNPAID');
    expect(apiGetMock).toHaveBeenCalledWith('/agencies/invoices?status=UNPAID');
    expect(rows[0]?.amountIrr).toBe('150000000');
  });

  it('fetchAggregateSeatRequests and decideAggregateSeatRequest use the manager endpoints', async () => {
    apiGetMock.mockResolvedValue([]);
    await fetchAggregateSeatRequests();
    expect(apiGetMock).toHaveBeenCalledWith('/agencies/seat-requests');

    apiPatchMock.mockResolvedValue({ id: 'sr1', status: 'APPROVED' });
    await decideAggregateSeatRequest('sr1', true, '2026-09-01T00:00:00.000Z');
    expect(apiPatchMock).toHaveBeenCalledWith('/agencies/seat-requests/sr1/decide', {
      approve: true,
      dueAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('ancillary adapters split grouped GET responses and send decimal price strings', async () => {
    apiGetMock.mockResolvedValue(LIST);
    apiPatchMock.mockResolvedValue(LIST);
    apiPostMock.mockResolvedValue(LIST);
    apiDeleteMock.mockResolvedValue(LIST);

    await expect(fetchSeatServices()).resolves.toEqual(LIST.seatServices);
    await expect(fetchOtherServices()).resolves.toEqual(LIST.otherServices);

    await setSeatServicePrice('seat-normal', '1500000');
    expect(apiPatchMock).toHaveBeenCalledWith('/ancillary-services/seat-normal/price', {
      priceIrr: '1500000',
    });

    await setOtherServicePrice('baggage', '0');
    expect(apiPatchMock).toHaveBeenCalledWith('/ancillary-services/baggage/price', {
      priceIrr: '0',
    });

    await toggleSeatService('seat-normal');
    expect(apiPatchMock).toHaveBeenCalledWith('/ancillary-services/seat-normal/enabled', {
      enabled: false,
    });

    await toggleOtherService('baggage');
    expect(apiPatchMock).toHaveBeenCalledWith('/ancillary-services/baggage/enabled', {
      enabled: false,
    });

    await addCustomService({ titleFa: 'اینترنت', descriptionFa: '', priceIrr: '1000' });
    expect(apiPostMock).toHaveBeenCalledWith('/ancillary-services', {
      titleFa: 'اینترنت',
      descriptionFa: '',
      priceIrr: '1000',
    });

    await deleteCustomService('custom-1');
    expect(apiDeleteMock).toHaveBeenCalledWith('/ancillary-services/custom-1');

    apiGetMock.mockResolvedValueOnce([{ key: 'baggage', titleFa: 'بار اضافه', descriptionFa: '', priceIrr: '2000000' }]);
    await fetchPublicAncillaryServices();
    expect(apiGetMock).toHaveBeenCalledWith('/public/ancillary-services');
  });
});
