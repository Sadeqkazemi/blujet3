export interface ReconciliationItem {
  id: string;
  pnr: string;
  bookingStatus: string;
  gatewayRefId: string;
  // Decimal STRING on the wire (BigInt.prototype.toJSON on the backend).
  amountIrr: string;
  createdAt: string;
}
