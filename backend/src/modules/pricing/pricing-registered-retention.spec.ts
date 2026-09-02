import { isCeoRegisteredProposalVisible } from './pricing.service';

describe('CEO registered pricing retention', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');

  it('keeps a registered proposal through its first three days', () => {
    expect(
      isCeoRegisteredProposalVisible(
        { approvedAt: new Date('2026-08-06T12:00:01.000Z') },
        now,
      ),
    ).toBe(true);
  });

  it('removes an older record from the CEO screen without deleting it', () => {
    expect(
      isCeoRegisteredProposalVisible(
        { approvedAt: new Date('2026-08-06T11:59:59.000Z') },
        now,
      ),
    ).toBe(false);
  });
});
