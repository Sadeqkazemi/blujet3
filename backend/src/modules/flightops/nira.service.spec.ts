import { NiraService } from '../nira/nira.service';
import { MockNiraProvider } from '../../common/nira/mock-nira.provider';

describe('NiraService', () => {
  it('always delegates to the provider and never fabricates a failure', async () => {
    const provider = new MockNiraProvider();
    const submitSpy = jest.spyOn(provider, 'submitManifest');
    const service = new NiraService(provider);

    const departureAt = new Date('2026-08-01T10:00:00.000Z');
    const passengers = [
      { fullName: 'علی رضایی', nationalId: '0012345678', seatCode: '12A' },
    ];
    const result = await service.submitManifest(
      'BJ-410',
      departureAt,
      passengers,
    );

    expect(result.success).toBe(true);
    expect(submitSpy).toHaveBeenCalledWith('BJ-410', departureAt, passengers);
  });
});
