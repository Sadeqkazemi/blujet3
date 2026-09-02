import {
  commercialCabinCapacity,
  maximumChannelRelease,
  releasedChannelSeatsLeft,
} from './commercial-cabin-capacity';

describe('commercial cabin channel inventory', () => {
  it('keeps fare allocations below the physical ceiling', () => {
    expect(commercialCabinCapacity(140, [50, 40])).toBe(90);
    expect(commercialCabinCapacity(90, [80, 30])).toBe(90);
  });

  it('shows only the unsold portion explicitly released to the site', () => {
    expect(releasedChannelSeatsLeft(80, 20, 7)).toBe(13);
  });

  it('never exceeds physical remaining seats or goes below zero', () => {
    expect(releasedChannelSeatsLeft(3, 20, 7)).toBe(3);
    expect(releasedChannelSeatsLeft(50, 5, 9)).toBe(0);
  });

  it('reserves the other channel share inside the fare allocation ceiling', () => {
    expect(maximumChannelRelease(30, 8)).toBe(22);
    expect(maximumChannelRelease(5, 9)).toBe(0);
  });
});
