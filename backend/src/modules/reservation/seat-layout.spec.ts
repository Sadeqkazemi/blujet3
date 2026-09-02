import {
  enumerateSeats,
  findAdjacentSeatCode,
  findAdjacentSeatPair,
} from './seat-layout';

describe('enumerateSeats', () => {
  it('finds an adjacent free seat without crossing the aisle', () => {
    const map = {
      businessRowStart: 1,
      businessRowEnd: 1,
      businessColsLeft: ['A', 'B'],
      businessColsRight: ['E', 'F'],
      economyRowStart: 2,
      economyRowEnd: 2,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['E', 'F'],
      excludedSeatCodes: [],
    };
    expect(findAdjacentSeatCode(map, '2A', new Set(['2A']))).toBe('2B');
    expect(findAdjacentSeatCode(map, '2B', new Set(['2A', '2B']))).toBeNull();
    expect(findAdjacentSeatCode(map, '2B', new Set(['2B']))).toBe('2A');
  });

  it('finds another available pair when the preferred row has no adjacent seat', () => {
    const map = {
      economyRowStart: 1,
      economyRowEnd: 2,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['E', 'F'],
    };
    expect(
      findAdjacentSeatPair(map, 'ECONOMY', new Set(['1B', '1E', '1F'])),
    ).toEqual(['2A', '2B']);
  });
  it('applies the persisted MD-80 first/business/economy bands and rear exclusions', () => {
    const seats = enumerateSeats({
      firstRowStart: 3,
      firstRowEnd: 6,
      firstColsLeft: ['A', 'B'],
      firstColsRight: ['E', 'F'],
      businessRowStart: 7,
      businessRowEnd: 11,
      businessColsLeft: ['A', 'B'],
      businessColsRight: ['D', 'E', 'F'],
      economyRowStart: 12,
      economyRowEnd: 32,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['D', 'E', 'F'],
      excludedSeatCodes: ['28A', '28B', '29A', '29B', '30A', '30B'],
    });

    expect(seats).toHaveLength(140);
    expect(seats.find((s) => s.seatCode === '4E')?.cabin).toBe('FIRST');
    expect(seats.find((s) => s.seatCode === '7D')?.cabin).toBe('BUSINESS');
    expect(seats.find((s) => s.seatCode === '12D')?.cabin).toBe('ECONOMY');
    expect(seats.find((s) => s.seatCode === '3C')).toBeUndefined();
    expect(seats.find((s) => s.seatCode === '7C')).toBeUndefined();
    expect(seats.find((s) => s.seatCode === '28A')).toBeUndefined();
    expect(seats.find((s) => s.seatCode === '28D')).toBeDefined();
    expect(seats.find((s) => s.seatCode === '31A')).toBeDefined();
  });

  it('enumerates COMFORT seats when comfort rows are configured', () => {
    const seats = enumerateSeats({
      businessRowStart: 3,
      businessRowEnd: 6,
      businessColsLeft: ['A', 'B'],
      businessColsRight: ['C', 'D'],
      comfortRowStart: 7,
      comfortRowEnd: 10,
      comfortColsLeft: ['A', 'B'],
      comfortColsRight: ['C', 'D', 'E'],
      economyRowStart: 11,
      economyRowEnd: 32,
      economyColsLeft: ['A', 'B'],
      economyColsRight: ['C', 'D', 'E'],
    });
    expect(seats.find((s) => s.seatCode === '7A')?.cabin).toBe('COMFORT');
    expect(seats.find((s) => s.seatCode === '11A')?.cabin).toBe('ECONOMY');
    expect(seats.filter((s) => s.cabin === 'COMFORT')).toHaveLength(20);
  });
});
