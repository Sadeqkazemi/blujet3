export interface ManagerReportRow {
  id: string;
  actorId: string;
  actorRole: string;
  /** Display name of the acting manager (CEO design card). */
  actorName?: string;
  category: string;
  action: string;
  detail: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}
