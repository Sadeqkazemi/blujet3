export type AgencyBulletinKind = 'NOTICE' | 'AMENDMENT';
export type AgencyBulletinAudienceMode = 'ALL' | 'SELECTED';

export interface AgencyBulletinRecipient {
  id: string;
  fullName: string;
  managerName: string;
  city: string;
}

export interface AgencyBulletinDispatch {
  id: string;
  kind: AgencyBulletinKind;
  title: string;
  body: string;
  recipientCount: number;
  readCount?: number;
  createdAt: string;
}

export interface CreateAgencyBulletinPayload {
  kind: AgencyBulletinKind;
  title: string;
  body: string;
  audienceMode: AgencyBulletinAudienceMode;
  recipientIds?: string[];
}
