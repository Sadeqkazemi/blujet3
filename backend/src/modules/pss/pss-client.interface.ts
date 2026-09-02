export const PSS_CLIENT = Symbol('PSS_CLIENT');

export interface PssCapabilities {
  service: 'blujet-pss';
  contractVersion: 'v1';
  salesEnabled: boolean;
  capabilities: Record<string, boolean>;
}

export interface PssShadowCounts {
  orders: number;
  travellers: number;
  heldOrders: number;
  ticketedOrders: number;
  inventoryTransactions: number;
}

export interface PssShadowSnapshot {
  capturedAt: string;
  website: PssShadowCounts;
}

export interface PssShadowReport {
  capturedAt: string;
  comparedAt: string;
  website: PssShadowCounts;
  pss: Record<keyof PssShadowCounts, number | null>;
  deltas: Record<keyof PssShadowCounts, number | null>;
  missingTables: string[];
  cutoverReady: boolean;
}

export interface PssClient {
  getCapabilities(requestId?: string): Promise<PssCapabilities>;
  reconcileShadow(
    snapshot: PssShadowSnapshot,
    requestId?: string,
  ): Promise<PssShadowReport>;
}
