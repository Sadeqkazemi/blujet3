export type JobType = 'FULL_TIME' | 'REMOTE' | 'PART_TIME';
export type JobApplicantGender = 'FEMALE' | 'MALE';
export type MaritalStatus = 'SINGLE' | 'MARRIED';
export type MilitaryStatus = 'CONSCRIPT' | 'EXEMPT' | 'WAIVED';
export type JobApplicationStatus = 'SUBMITTED' | 'REFERRED' | 'HIRED' | 'REJECTED';

export interface CareersSettings {
  enabled: boolean;
}

export interface JobSummary {
  id: string;
  title: string;
  dept: string;
  city: string;
  type: JobType;
  description?: string;
  imageFileId?: string | null;
  imageUrl?: string | null;
}

export interface JobDetail extends JobSummary {
  /** Contract: always arrays; tolerate null at the edge. */
  generalReqs: string[] | null;
  specialReqs: string[] | null;
}

export interface JobPosting extends JobDetail {
  active: boolean;
  description: string;
  imageFileId: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobPostingInput {
  title: string;
  dept: string;
  city: string;
  type: JobType;
  generalReqs: string[];
  specialReqs: string[];
  description?: string;
  imageFileId?: string | null;
}

export type UpdateJobPostingInput = Partial<CreateJobPostingInput> & { active?: boolean };

export interface EducationEntry {
  [key: string]: string | undefined;
  major?: string;
  degree?: string;
  courses?: string;
  otherCourses?: string;
  /** legacy keys still accepted when reading older applications */
  field?: string;
  institute?: string;
}

export interface WorkEntry {
  [key: string]: string | undefined;
  company?: string;
  position?: string;
  fromYear?: string;
  toYear?: string;
  reason?: string;
  /** legacy keys still accepted when reading older applications */
  role?: string;
  years?: string;
}

export interface LanguageEntry {
  [key: string]: string | undefined;
  lang?: string;
  level?: string;
}

export interface ApplyJobInput {
  firstName: string;
  lastName: string;
  nationalId: string;
  fatherName?: string;
  birthDate?: string;
  birthProvince?: string;
  birthCity?: string;
  gender?: JobApplicantGender;
  marital?: MaritalStatus;
  military?: MilitaryStatus;
  exemptionType?: string;
  phone: string;
  email?: string;
  residenceProvince?: string;
  residenceAddress?: string;
  skills?: string;
  otherLangs?: string;
  eduEntries?: EducationEntry[];
  workEntries?: WorkEntry[];
  langEntries?: LanguageEntry[];
  resume?: File;
}

export interface JobApplicationRow {
  id: string;
  name: string;
  jobTitle: string;
  nationalId: string;
  phone: string;
  email: string | null;
  at: string;
  status: JobApplicationStatus;
  hasResume: boolean;
  eduCount: number;
  workCount: number;
  assigneeLabelFa: string | null;
}

export interface ReferralTarget {
  id: string;
  labelFa: string;
}

export interface JobApplicationDetail {
  id: string;
  name: string;
  jobTitle: string;
  nationalId: string;
  fatherName: string | null;
  birthDate: string | null;
  phone: string;
  email: string | null;
  residenceAddress: string | null;
  gender: JobApplicantGender | null;
  military: MilitaryStatus | null;
  exemptionType: string | null;
  skills: string | null;
  eduEntries: EducationEntry[];
  workEntries: WorkEntry[];
  langEntries: LanguageEntry[];
  hasResume: boolean;
  resumeFileName: string | null;
  status: JobApplicationStatus;
  canAct: boolean;
  history: { step: string; label: string; at: string }[];
  referralTargets: ReferralTarget[];
}
