export interface PermissionCatalogSection {
  sectionKey: string;
  sectionLabelFa: string;
  perms: { key: string; labelFa: string }[];
}

export type PermissionCatalog = Record<string, PermissionCatalogSection[]>;

export interface EmployeeListRow {
  id: string;
  fullName: string;
  username: string;
  dept: string | null;
  rank: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface EmployeeDetail extends EmployeeListRow {
  phone: string;
  referralScope: 'MANAGERS_ONLY' | 'ALL_STAFF' | null;
  mustChangePassword: boolean;
  permissions: { key: string; labelFa: string; sectionLabelFa: string }[];
  available: { key: string; labelFa: string }[];
}

export interface SecurityPolicy {
  id: number;
  minLength: number;
  expiryDays: number;
  maxAttempts: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  blockReuse: boolean;
  staffTwoFactorMandatory: boolean;
  updatedAt: string;
}

export interface ActiveSession {
  id: string;
  who: string;
  role: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface InternalService {
  id: string;
  key: string;
  nameFa: string;
  enabled: boolean;
  uptimePct: number;
}

export interface ExternalService {
  id: string;
  key: string;
  nameFa: string;
  provider: string;
  endpoint: string;
  method: 'GET' | 'POST';
  timeoutMs: number;
  sandbox: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

export interface ItServicesResult {
  internal: InternalService[];
  external: ExternalService[];
}

export interface ServiceReportResult {
  service: {
    kind: 'internal' | 'external';
    id: string;
    key: string;
    nameFa: string;
    enabled: boolean;
  };
  items: {
    id: string;
    action: string;
    detail: string;
    actorName: string;
    createdAt: string;
    level: 'info' | 'warn';
  }[];
  total: number;
  page: number;
  limit: number;
}

export interface SmsLogEntry {
  id: string;
  phoneMasked: string;
  messageType: 'OTP' | 'TEMP_PASSWORD';
  status: 'SUCCESS' | 'FAILED';
  failureReason: string | null;
  createdAt: string;
}

export interface SmsLogResult {
  enabled: boolean;
  todaySuccessCount: number;
  todayFailedCount: number;
  recent: SmsLogEntry[];
}

export interface BackupRecord {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface BackupSchedule {
  databaseBackup: string;
  fileBackup: string;
  retentionDays: number;
  cloudStorage: string;
}

export interface ItDashboardData {
  kpis: {
    servicesUp: number;
    servicesTotal: number;
    uptime30dPct: number;
    activeSessions: number;
    securityAlerts: number;
    allServicesHealthy: boolean;
    lastBackupStatus: string | null;
    lastBackupAt: string | null;
  };
  serviceHealth: { name: string; uptimePct: number | null; enabled: boolean }[];
  resources: {
    cpuUsedPct: number;
    memoryUsedPct: number;
    diskUsedPct: number | null;
    bandwidthUsedPct: number | null;
    loadAvg1m: number;
    cpuCount: number;
    uptimeSeconds: number;
  };
  recentEvents: { id: string; text: string; category: string; createdAt: string }[];
}

export interface AuditLogRow {
  id: string;
  actorRole: string;
  category: string;
  action: string;
  detail: string;
  createdAt: string;
  actorName: string;
  unit: string;
  level: 'info' | 'warn' | 'error';
}

export type ItApiScope = 'FULL' | 'SEARCH_BOOK' | 'SEARCH_ONLY';
export type ItApiClientStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type ItApiEnvironment = 'SANDBOX' | 'PRODUCTION';
export type ItApiFlightDomain = 'ALL' | 'DOMESTIC' | 'INTERNATIONAL';
export type ItApiCapability =
  | 'RESERVATION'
  | 'TICKETING'
  | 'PRICING'
  | 'FLIGHT_INFO'
  | 'REFUND'
  | 'CHECK_IN'
  | 'AVAILABILITY';

export interface ItWebserviceRequestRow {
  id: string;
  agencyId: string;
  agency: string;
  scope: ItApiScope;
  months: number;
  priceIrr: string;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decidedAt: string | null;
}

export interface ItApiClientRow {
  id: string;
  agencyId: string;
  agency: string;
  keyHint: string;
  scope: ItApiScope;
  capabilities: ItApiCapability[];
  environment: ItApiEnvironment;
  flightDomain: ItApiFlightDomain;
  ipWhitelist: string[];
  rateLimitPerMinute: number | null;
  status: ItApiClientStatus;
  activatedAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  callCount: number;
  errorRatePct: number | null;
}

export interface ItApiEventRow {
  id: string;
  actor: string;
  action: string;
  detail: string | null;
  category: string;
  type: 'SECURITY' | 'AUDIT';
  level: 'INFO' | 'WARN' | 'ERROR';
  createdAt: string;
}

export interface ItWebservicesOverview {
  kpis: {
    activeClients: number;
    issuedKeys: number;
    pendingRequests: number;
    securityEventsToday: number;
  };
  requests: ItWebserviceRequestRow[];
  clients: ItApiClientRow[];
  eligibleAgencies: { id: string; name: string; licenseNo?: string }[];
  events: ItApiEventRow[];
}

export interface IssuedItApiKey {
  id: string;
  agencyId: string;
  keyHint: string;
  scope: ItApiScope;
  status: ItApiClientStatus;
  capabilities?: ItApiCapability[];
  environment?: ItApiEnvironment;
  flightDomain?: ItApiFlightDomain;
  ipWhitelist?: string[];
  rateLimitPerMinute?: number | null;
  expiresAt?: string | null;
  rawKey?: string;
}

export interface ItAvailabilityTestResult {
  allowed: boolean;
  flightInstanceId: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  capacity: number;
  seatsSold: number;
  seatsLeft: number;
}
