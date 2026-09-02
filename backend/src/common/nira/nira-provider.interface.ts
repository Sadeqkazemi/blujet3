export const NIRA_PROVIDER = Symbol('NIRA_PROVIDER');

export interface NiraManifestPassenger {
  fullName: string;
  nationalId: string | null;
  seatCode: string | null;
}

export interface NiraSubmissionResult {
  success: boolean;
}

/** Vendor-swappable سامانه نیرا (Iran civil aviation manifest system)
 * submission — CLAUDE.md: behind an interface, mock provider in
 * dev/tests, same pattern as SmsProvider/PaymentGateway. Never called
 * directly by callers; always through NiraService. */
export interface NiraProvider {
  submitManifest(
    flightNo: string,
    departureAt: Date,
    passengers: NiraManifestPassenger[],
  ): Promise<NiraSubmissionResult>;
}
