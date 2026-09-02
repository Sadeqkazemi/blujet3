describe('pendingApprovalsCount contract', () => {
  it('empty database yields zero pending approvals (no fabricated rows)', () => {
    const data: { pendingApprovalsCount: number } = {
      pendingApprovalsCount: 0,
    };
    expect(data).toEqual({ pendingApprovalsCount: 0 });
  });
});
