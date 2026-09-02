import { agencySeatSuggestion } from './agency-portal.service';

describe('agencySeatSuggestion', () => {
  it('keeps a request that fits the released agency inventory', () => {
    expect(agencySeatSuggestion(12, 20)).toEqual({
      suggestedSeats: 12,
      canFulfillRequested: true,
    });
  });

  it('caps an oversized request at the released agency inventory', () => {
    expect(agencySeatSuggestion(24, 7)).toEqual({
      suggestedSeats: 7,
      canFulfillRequested: false,
    });
  });
});
