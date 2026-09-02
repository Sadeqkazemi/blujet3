import { assignPassengerSeats } from './seat-assignment-policy';
import type { AircraftSeatMapLike } from '../reservation/seat-layout';

const MAP: AircraftSeatMapLike = {
  firstRowStart: null,
  firstRowEnd: null,
  firstColsLeft: null,
  firstColsRight: null,
  businessRowStart: 1,
  businessRowEnd: 1,
  businessColsLeft: ['A', 'B'],
  businessColsRight: ['D', 'E', 'F'],
  comfortRowStart: null,
  comfortRowEnd: null,
  comfortColsLeft: null,
  comfortColsRight: null,
  economyRowStart: 2,
  economyRowEnd: 5,
  economyColsLeft: ['A', 'B'],
  economyColsRight: ['D', 'E', 'F'],
  excludedSeatCodes: [],
  exitRows: [4],
};

describe('assignPassengerSeats', () => {
  it('keeps a child beside an adult from the same booking', () => {
    const assigned = assignPassengerSeats({
      map: MAP,
      cabin: 'ECONOMY',
      passengers: [
        { passengerType: 'ADULT', gender: 'female' },
        { passengerType: 'CHILD', gender: 'female' },
      ],
      occupied: [],
    });

    expect(assigned).toEqual(['2A', '2B']);
  });

  it('uses a full three-seat block for two adults travelling with a child', () => {
    const assigned = assignPassengerSeats({
      map: MAP,
      cabin: 'ECONOMY',
      passengers: [
        { passengerType: 'ADULT', gender: 'female' },
        { passengerType: 'ADULT', gender: 'male' },
        { passengerType: 'CHILD', gender: 'female' },
      ],
      occupied: [],
    });

    expect(assigned).toEqual(['2D', '2E', '2F']);
  });

  it('does not treat free seats separated by an occupied middle seat as adjacent', () => {
    const assigned = assignPassengerSeats({
      map: MAP,
      cabin: 'ECONOMY',
      passengers: [
        { passengerType: 'ADULT', gender: 'female' },
        { passengerType: 'CHILD', gender: 'female' },
      ],
      occupied: [
        { seatCode: '2A', gender: 'male', hasLapInfant: false },
        { seatCode: '2E', gender: 'male', hasLapInfant: false },
      ],
    });

    expect(assigned).toEqual(['3A', '3B']);
  });

  it('places a solo passenger beside an existing passenger of the same gender', () => {
    const assigned = assignPassengerSeats({
      map: MAP,
      cabin: 'ECONOMY',
      passengers: [{ passengerType: 'ADULT', gender: 'male' }],
      occupied: [{ seatCode: '3E', gender: 'male', hasLapInfant: false }],
    });

    expect(assigned).toEqual(['3D']);
  });

  it('prefers the aisle and then window seat of a three-seat block as fallback', () => {
    expect(
      assignPassengerSeats({
        map: MAP,
        cabin: 'ECONOMY',
        passengers: [{ passengerType: 'ADULT', gender: 'female' }],
        occupied: [],
      }),
    ).toEqual(['2D']);

    expect(
      assignPassengerSeats({
        map: MAP,
        cabin: 'ECONOMY',
        passengers: [{ passengerType: 'ADULT', gender: 'female' }],
        occupied: [{ seatCode: '2D', gender: 'male', hasLapInfant: false }],
      }),
    ).toEqual(['2F']);
  });

  it('recognizes the aisle edge of a three-seat block on the left side', () => {
    const assigned = assignPassengerSeats({
      map: {
        ...MAP,
        economyColsLeft: ['A', 'B', 'C'],
        economyColsRight: ['D', 'E'],
      },
      cabin: 'ECONOMY',
      passengers: [{ passengerType: 'ADULT', gender: 'male' }],
      occupied: [],
    });

    expect(assigned).toEqual(['2C']);
  });

  it('keeps an adult carrying an infant out of exit rows and infant-occupied blocks', () => {
    const assigned = assignPassengerSeats({
      map: MAP,
      cabin: 'ECONOMY',
      passengers: [
        { passengerType: 'ADULT', gender: 'female' },
        { passengerType: 'INFANT', gender: 'female' },
      ],
      occupied: [
        { seatCode: '2A', gender: 'male', hasLapInfant: true },
        { seatCode: '2B', gender: 'male', hasLapInfant: false },
        { seatCode: '2D', gender: 'female', hasLapInfant: true },
        { seatCode: '2E', gender: 'female', hasLapInfant: false },
        { seatCode: '2F', gender: 'female', hasLapInfant: false },
        { seatCode: '3A', gender: 'male', hasLapInfant: false },
        { seatCode: '3B', gender: 'male', hasLapInfant: false },
        { seatCode: '3D', gender: 'female', hasLapInfant: false },
        { seatCode: '3E', gender: 'female', hasLapInfant: false },
        { seatCode: '3F', gender: 'female', hasLapInfant: false },
      ],
    });

    expect(assigned[0]).toMatch(/^5/);
    expect(assigned[1]).toBeNull();
  });

  it('preserves a valid manual choice and fills the rest beside it', () => {
    const assigned = assignPassengerSeats({
      map: MAP,
      cabin: 'ECONOMY',
      passengers: [
        { passengerType: 'ADULT', gender: 'male', seatCode: '3E' },
        { passengerType: 'ADULT', gender: 'female' },
      ],
      occupied: [],
    });

    expect(assigned).toEqual(['3E', '3D']);
  });
});
