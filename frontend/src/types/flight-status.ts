export interface FlightStatusResult {
  flightInstanceId: string;
  flightNo: string;
  aircraftType: string;
  originCode: string;
  originCityFa: string;
  destCode: string;
  destCityFa: string;
  departureAt: string;
  arrivalAt: string;
  status: 'SCHEDULED' | 'DEPARTED' | 'CANCELLED';
  statusLabelFa: string;
}
