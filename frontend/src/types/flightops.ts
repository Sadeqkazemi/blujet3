export interface FlightopsRow {
  id: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  capacity: number;
  sold: number;
  free: number;
  closed: boolean;
  niraSubmittedAt: string | null;
}

export interface FlightopsList {
  kpis: {
    total: number;
    open: number;
    closed: number;
    soldTotal: number;
  };
  rows: FlightopsRow[];
}

export interface FlightopsManifestPassenger {
  fullName: string;
  nationalId: string | null;
  seatCode: string | null;
  pnr: string;
}

export interface FlightopsDetail extends FlightopsRow {
  occupancyPct: number;
  manifest: FlightopsManifestPassenger[];
}
