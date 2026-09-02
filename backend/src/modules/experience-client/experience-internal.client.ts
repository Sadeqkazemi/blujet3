import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  ListPublicBlogPostsQueryDto,
  UpdateBlogPostDto,
} from '../blog/dto/blog.dtos';
import type { SubmitContactMessageDto } from '../contact/dto/contact.dtos';
import type {
  AddLibraryAssetDto,
  CreateDestinationDto,
  CreateRouteDto,
  UpdateContentBlockDto,
  UpdateDestinationDto,
  UpdateRouteDto,
} from '../site-content/dto/site-content.dtos';
import type { SiteContentBlockKey } from '../../database/enums';
import type {
  ApplyJobDto,
  CreateJobPostingDto,
  ListApplicationsQueryDto,
  UpdateCareersSettingsDto,
  UpdateJobPostingDto,
} from '../careers/dto/careers.dtos';
import type {
  AdminCreateSupportTicketDto,
  ReplySupportTicketDto,
  SubmitSupportTicketDto,
} from '../support-tickets/dto/support-ticket.dtos';
import type { SupportTicketStatus } from '../../database/enums';
import type {
  CreateSurveyQuestionDto,
  SubmitSurveyResponseDto,
  UpdateSurveySettingsDto,
} from '../survey/dto/survey.dtos';

interface InternalEnvelope {
  success: boolean;
  data?: unknown;
}

interface InternalErrorBody {
  code?: string;
  message?: string;
}

export interface ContactMessageView {
  id: string;
  name: string;
  phone: string;
  subject: string;
  body: string;
  createdAt: Date;
}

type ContactMessageWire = Omit<ContactMessageView, 'createdAt'> & {
  createdAt: string;
};

export interface BlogPostView {
  id?: string;
  slug: string;
  title: string;
  body?: string;
  excerpt?: string;
  category: string;
  categoryLabelFa: string;
  status?: string;
  statusLabelFa?: string;
  authorName: string;
  viewCount: number;
  coverFileId: string | null;
  publishedAt: Date | null;
  scheduledAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type BlogPostWire = Omit<
  BlogPostView,
  'publishedAt' | 'scheduledAt' | 'createdAt' | 'updatedAt'
> & {
  publishedAt: string | null;
  scheduledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export interface BlogStatsView {
  publishedCount: number;
  draftCount: number;
  totalViews: number;
  commentCount: number;
}

export interface SiteLibraryView {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileId: string;
  url: string;
  createdAt: Date;
}

type SiteLibraryWire = Omit<SiteLibraryView, 'createdAt'> & {
  createdAt: string;
};

export interface SiteBlockView {
  key: SiteContentBlockKey;
  enabled: boolean;
  title: string;
  subtitle: string;
  buttonText: string;
  badgeText: string;
  imageFileId: string | null;
  imageUrl: string | null;
}

export interface SiteDestinationView {
  id: string;
  airportCode: string;
  priceIrr: string;
  imageFileId: string | null;
  imageUrl?: string | null;
  sortOrder: number;
}

export interface SiteRouteView {
  id: string;
  fromAirportCode: string;
  toAirportCode: string;
  priceIrr: string;
  sortOrder: number;
}

export interface PublicSiteContentView {
  blocks: SiteBlockView[];
  destinations: SiteDestinationView[];
  routes: SiteRouteView[];
}

export interface CareerPostingView {
  id: string;
  title: string;
  dept: string;
  city: string;
  type: string;
  description: string;
  generalReqs?: string[];
  specialReqs?: string[];
  active?: boolean;
  imageFileId: string | null;
  imageUrl: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type CareerPostingWire = Omit<CareerPostingView, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export interface CareerApplicationView extends Record<string, unknown> {
  id: string;
}

export interface ResumeWire {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface SupportTicketView extends Record<string, unknown> {
  id: string;
  trackingCode?: string;
  subject?: string;
  status?: string;
  conversation: Array<{
    id: string;
    body: string;
    senderType: 'REQUESTER' | 'STAFF';
    senderLabel: string;
    createdAt: string;
    attachments: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  }>;
}

export interface SurveyBookingSnapshot {
  bookingId: string;
  flightInstanceId: string;
  contactPhone: string | null;
  flightNo: string;
  originCityFa: string;
  destCityFa: string;
  departureAt: string;
}

export interface PendingSurveyNotification {
  inviteId: string;
  token: string;
  phone: string;
}

function isInternalEnvelope(value: unknown): value is InternalEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof value.success === 'boolean'
  );
}

function toContactMessage(row: ContactMessageWire): ContactMessageView {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function toBlogPost(row: BlogPostWire): BlogPostView {
  return {
    ...row,
    publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
    scheduledAt: row.scheduledAt ? new Date(row.scheduledAt) : null,
    createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
  };
}

function actorContext(actor: AuthenticatedUser) {
  return {
    id: actor.id,
    role: actor.role,
    fullName: actor.fullName,
    isSuperAdmin: Boolean(actor.isSuperAdmin),
  };
}

function toCareerPosting(row: CareerPostingWire): CareerPostingView {
  return {
    ...row,
    createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
  };
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

@Injectable()
export class ExperienceInternalClient {
  enabled(): boolean {
    return process.env.EXPERIENCE_INTEGRATION_ENABLED === 'true';
  }

  async submitContact(
    dto: SubmitContactMessageDto,
  ): Promise<ContactMessageView> {
    const row = await this.request<ContactMessageWire>('/internal/v1/contact', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return toContactMessage(row);
  }

  async listRecentContact(): Promise<ContactMessageView[]> {
    const rows = await this.request<ContactMessageWire[]>(
      '/internal/v1/contact',
    );
    return rows.map(toContactMessage);
  }

  async getBlogStats(actor: AuthenticatedUser): Promise<BlogStatsView> {
    return this.request<BlogStatsView>('/internal/v1/blog/admin/stats', {
      method: 'POST',
      body: JSON.stringify(actorContext(actor)),
    });
  }

  async listAdminBlogPosts(
    actor: AuthenticatedUser,
    query: ListBlogPostsQueryDto,
  ): Promise<BlogPostView[]> {
    const rows = await this.request<BlogPostWire[]>(
      `/internal/v1/blog/admin/posts/search${queryString(query)}`,
      { method: 'POST', body: JSON.stringify(actorContext(actor)) },
    );
    return rows.map(toBlogPost);
  }

  async getAdminBlogPost(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<BlogPostView> {
    const row = await this.request<BlogPostWire>(
      `/internal/v1/blog/admin/posts/${encodeURIComponent(id)}/detail`,
      { method: 'POST', body: JSON.stringify(actorContext(actor)) },
    );
    return toBlogPost(row);
  }

  async createBlogPost(
    actor: AuthenticatedUser,
    input: CreateBlogPostDto,
  ): Promise<BlogPostView> {
    const row = await this.request<BlogPostWire>(
      '/internal/v1/blog/admin/posts',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
    return toBlogPost(row);
  }

  async updateBlogPost(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateBlogPostDto,
  ): Promise<BlogPostView> {
    const row = await this.request<BlogPostWire>(
      `/internal/v1/blog/admin/posts/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
    return toBlogPost(row);
  }

  async deleteBlogPost(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      `/internal/v1/blog/admin/posts/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ actor: actorContext(actor) }),
      },
    );
  }

  async listPublicBlogPosts(
    query: ListPublicBlogPostsQueryDto,
  ): Promise<BlogPostView[]> {
    const rows = await this.request<BlogPostWire[]>(
      `/internal/v1/blog/public/posts${queryString(query)}`,
    );
    return rows.map(toBlogPost);
  }

  async getPublicBlogPost(slug: string): Promise<BlogPostView> {
    const row = await this.request<BlogPostWire>(
      `/internal/v1/blog/public/posts/${encodeURIComponent(slug)}`,
    );
    return toBlogPost(row);
  }

  async listSiteLibrary(actor: AuthenticatedUser): Promise<SiteLibraryView[]> {
    const rows = await this.request<SiteLibraryWire[]>(
      '/internal/v1/site-content/admin/library/search',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
    return rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
    }));
  }

  async addSiteLibraryAsset(
    actor: AuthenticatedUser,
    input: AddLibraryAssetDto,
  ): Promise<SiteLibraryView> {
    const row = await this.request<SiteLibraryWire>(
      '/internal/v1/site-content/admin/library',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
    return { ...row, createdAt: new Date(row.createdAt) };
  }

  async deleteSiteLibraryAsset(actor: AuthenticatedUser, id: string) {
    return this.deleteSiteResource(
      actor,
      `/internal/v1/site-content/admin/library/${encodeURIComponent(id)}`,
    );
  }

  async listSiteBlocks(actor: AuthenticatedUser): Promise<SiteBlockView[]> {
    return this.request<SiteBlockView[]>(
      '/internal/v1/site-content/admin/blocks/search',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async updateSiteBlock(
    actor: AuthenticatedUser,
    key: SiteContentBlockKey,
    input: UpdateContentBlockDto,
  ): Promise<SiteBlockView> {
    return this.request<SiteBlockView>(
      `/internal/v1/site-content/admin/blocks/${encodeURIComponent(key)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async listSiteDestinations(
    actor: AuthenticatedUser,
  ): Promise<SiteDestinationView[]> {
    return this.request<SiteDestinationView[]>(
      '/internal/v1/site-content/admin/destinations/search',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async createSiteDestination(
    actor: AuthenticatedUser,
    input: CreateDestinationDto,
  ): Promise<SiteDestinationView> {
    return this.request<SiteDestinationView>(
      '/internal/v1/site-content/admin/destinations',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async updateSiteDestination(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateDestinationDto,
  ): Promise<SiteDestinationView> {
    return this.request<SiteDestinationView>(
      `/internal/v1/site-content/admin/destinations/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async deleteSiteDestination(actor: AuthenticatedUser, id: string) {
    return this.deleteSiteResource(
      actor,
      `/internal/v1/site-content/admin/destinations/${encodeURIComponent(id)}`,
    );
  }

  async listSiteRoutes(actor: AuthenticatedUser): Promise<SiteRouteView[]> {
    return this.request<SiteRouteView[]>(
      '/internal/v1/site-content/admin/routes/search',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async createSiteRoute(
    actor: AuthenticatedUser,
    input: CreateRouteDto,
  ): Promise<SiteRouteView> {
    return this.request<SiteRouteView>(
      '/internal/v1/site-content/admin/routes',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async updateSiteRoute(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateRouteDto,
  ): Promise<SiteRouteView> {
    return this.request<SiteRouteView>(
      `/internal/v1/site-content/admin/routes/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async deleteSiteRoute(actor: AuthenticatedUser, id: string) {
    return this.deleteSiteResource(
      actor,
      `/internal/v1/site-content/admin/routes/${encodeURIComponent(id)}`,
    );
  }

  async getPublicSiteContent(
    locale: 'fa' | 'en' | 'ar',
  ): Promise<PublicSiteContentView> {
    return this.request<PublicSiteContentView>(
      `/internal/v1/site-content/public/home-content?locale=${locale}`,
    );
  }

  async getCareersSettings(): Promise<{ enabled: boolean }> {
    return this.request<{ enabled: boolean }>(
      '/internal/v1/careers/public/settings',
    );
  }

  async updateCareersSettings(
    actor: AuthenticatedUser,
    input: UpdateCareersSettingsDto,
  ): Promise<{ enabled: boolean }> {
    return this.request<{ enabled: boolean }>(
      '/internal/v1/careers/admin/settings',
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async listActiveCareerJobs(): Promise<CareerPostingView[]> {
    const rows = await this.request<CareerPostingWire[]>(
      '/internal/v1/careers/public/jobs',
    );
    return rows.map(toCareerPosting);
  }

  async getPublicCareerJob(id: string): Promise<CareerPostingView> {
    const row = await this.request<CareerPostingWire>(
      `/internal/v1/careers/public/jobs/${encodeURIComponent(id)}`,
    );
    return toCareerPosting(row);
  }

  async applyForCareerJob(
    jobId: string,
    input: ApplyJobDto,
    file?: Express.Multer.File,
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      '/internal/v1/careers/public/applications',
      {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          input,
          ...(file
            ? {
                resume: {
                  originalName: Buffer.from(
                    file.originalname,
                    'latin1',
                  ).toString('utf8'),
                  mimeType: file.mimetype,
                  sizeBytes: file.size,
                  contentBase64: file.buffer.toString('base64'),
                },
              }
            : {}),
        }),
      },
    );
  }

  async listCareerPostings(
    actor: AuthenticatedUser,
  ): Promise<CareerPostingView[]> {
    const rows = await this.request<CareerPostingWire[]>(
      '/internal/v1/careers/admin/postings/search',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
    return rows.map(toCareerPosting);
  }

  async createCareerPosting(
    actor: AuthenticatedUser,
    input: CreateJobPostingDto,
  ): Promise<CareerPostingView> {
    const row = await this.request<CareerPostingWire>(
      '/internal/v1/careers/admin/postings',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
    return toCareerPosting(row);
  }

  async updateCareerPosting(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateJobPostingDto,
  ): Promise<CareerPostingView> {
    const row = await this.request<CareerPostingWire>(
      `/internal/v1/careers/admin/postings/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
    return toCareerPosting(row);
  }

  async listCareerApplications(
    actor: AuthenticatedUser,
    query: ListApplicationsQueryDto,
  ): Promise<CareerApplicationView[]> {
    return this.request<CareerApplicationView[]>(
      `/internal/v1/careers/admin/applications/search${queryString(query)}`,
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async getCareerApplication(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<CareerApplicationView> {
    return this.request<CareerApplicationView>(
      `/internal/v1/careers/admin/applications/${encodeURIComponent(id)}/detail`,
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async getCareerResume(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<ResumeWire> {
    return this.request<ResumeWire>(
      `/internal/v1/careers/admin/applications/${encodeURIComponent(id)}/resume`,
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async referCareerApplication(
    actor: AuthenticatedUser,
    id: string,
    target: { id: string; fullName: string },
  ) {
    return this.request<{ id: string; status: string }>(
      `/internal/v1/careers/admin/applications/${encodeURIComponent(id)}/refer`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), target }),
      },
    );
  }

  async decideCareerApplication(
    actor: AuthenticatedUser,
    id: string,
    decision: 'hire' | 'reject',
  ) {
    return this.request<{ id: string; status: string }>(
      `/internal/v1/careers/admin/applications/${encodeURIComponent(id)}/${decision}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor) }),
      },
    );
  }

  async storeFile(
    actor: AuthenticatedUser,
    file: Express.Multer.File,
  ): Promise<{ id: string; fileName: string; sizeBytes: number }> {
    return this.request<{ id: string; fileName: string; sizeBytes: number }>(
      '/internal/v1/files',
      {
        method: 'POST',
        body: JSON.stringify({
          actor: actorContext(actor),
          file: {
            originalName: Buffer.from(file.originalname, 'latin1').toString(
              'utf8',
            ),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            contentBase64: file.buffer.toString('base64'),
          },
        }),
      },
    );
  }

  async deleteFile(actor: AuthenticatedUser, id: string) {
    return this.request<{ id: string }>(
      `/internal/v1/files/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ actor: actorContext(actor) }),
      },
    );
  }

  async submitPublicSupport(input: SubmitSupportTicketDto) {
    return this.request<{ id: string; trackingCode: string }>(
      '/internal/v1/support/public/tickets',
      { method: 'POST', body: JSON.stringify(input) },
    );
  }

  async submitSupportForUser(
    actor: AuthenticatedUser,
    input: SubmitSupportTicketDto,
  ) {
    return this.request<{ id: string; trackingCode: string }>(
      '/internal/v1/support/mine/tickets',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async listMySupport(actor: AuthenticatedUser, callerPhone?: string) {
    return this.request<SupportTicketView[]>(
      '/internal/v1/support/mine/tickets/search',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), callerPhone }),
      },
    );
  }

  async getMySupport(
    actor: AuthenticatedUser,
    id: string,
    callerPhone?: string,
  ) {
    return this.request<SupportTicketView>(
      `/internal/v1/support/mine/tickets/${encodeURIComponent(id)}/detail`,
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), callerPhone }),
      },
    );
  }

  async replyMySupport(
    actor: AuthenticatedUser,
    id: string,
    input: ReplySupportTicketDto,
    callerPhone?: string,
  ) {
    return this.request<SupportTicketView>(
      `/internal/v1/support/mine/tickets/${encodeURIComponent(id)}/replies`,
      {
        method: 'POST',
        body: JSON.stringify({
          actor: actorContext(actor),
          callerPhone,
          input,
        }),
      },
    );
  }

  async feedbackMySupport(
    actor: AuthenticatedUser,
    id: string,
    satisfied: boolean,
    callerPhone?: string,
  ) {
    return this.request<SupportTicketView>(
      `/internal/v1/support/mine/tickets/${encodeURIComponent(id)}/feedback`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          actor: actorContext(actor),
          callerPhone,
          satisfied,
        }),
      },
    );
  }

  async createAdminSupport(
    actor: AuthenticatedUser,
    input: AdminCreateSupportTicketDto,
  ) {
    return this.request<SupportTicketView>(
      '/internal/v1/support/admin/tickets',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async listAdminSupport(
    actor: AuthenticatedUser,
    filters: { status?: SupportTicketStatus; dept?: 'SITE' | 'AGENCY' },
  ) {
    return this.request<SupportTicketView[]>(
      `/internal/v1/support/admin/tickets/search${queryString(filters)}`,
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async getAdminSupport(actor: AuthenticatedUser, id: string) {
    return this.request<SupportTicketView>(
      `/internal/v1/support/admin/tickets/${encodeURIComponent(id)}/detail`,
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async replyAdminSupport(
    actor: AuthenticatedUser,
    id: string,
    input: ReplySupportTicketDto,
  ) {
    return this.request<SupportTicketView>(
      `/internal/v1/support/admin/tickets/${encodeURIComponent(id)}/replies`,
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async forwardAdminSupport(
    actor: AuthenticatedUser,
    id: string,
    target: { id: string; fullName: string; roleLabelFa: string },
  ) {
    return this.request<SupportTicketView>(
      `/internal/v1/support/admin/tickets/${encodeURIComponent(id)}/forward`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), target }),
      },
    );
  }

  async updateAdminSupportStatus(
    actor: AuthenticatedUser,
    id: string,
    status: SupportTicketStatus,
  ) {
    return this.request<SupportTicketView>(
      `/internal/v1/support/admin/tickets/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), status }),
      },
    );
  }

  async materializeSurveyInvites(bookings: SurveyBookingSnapshot[]) {
    return this.request<{
      pendingNotifications: PendingSurveyNotification[];
    }>('/internal/v1/survey/materialize', {
      method: 'POST',
      body: JSON.stringify({ bookings }),
    });
  }

  async acknowledgeSurveyInvite(inviteId: string) {
    return this.request<{ inviteId: string; acknowledged: boolean }>(
      '/internal/v1/survey/materialize/ack',
      { method: 'PATCH', body: JSON.stringify({ inviteId }) },
    );
  }

  async getSurveySettings(actor: AuthenticatedUser) {
    return this.request<Record<string, unknown>>(
      '/internal/v1/survey/admin/settings/detail',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async updateSurveySettings(
    actor: AuthenticatedUser,
    input: UpdateSurveySettingsDto,
  ) {
    return this.request<Record<string, unknown>>(
      '/internal/v1/survey/admin/settings',
      {
        method: 'PATCH',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async listSurveyQuestions(actor: AuthenticatedUser) {
    return this.request<Array<{ id: string; label: string; order: number }>>(
      '/internal/v1/survey/admin/questions/search',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async addSurveyQuestion(
    actor: AuthenticatedUser,
    input: CreateSurveyQuestionDto,
  ) {
    return this.request<{ id: string; label: string; order: number }>(
      '/internal/v1/survey/admin/questions',
      {
        method: 'POST',
        body: JSON.stringify({ actor: actorContext(actor), input }),
      },
    );
  }

  async removeSurveyQuestion(actor: AuthenticatedUser, id: string) {
    return this.request<{ id: string }>(
      `/internal/v1/survey/admin/questions/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ actor: actorContext(actor) }),
      },
    );
  }

  async getSurveyStats(actor: AuthenticatedUser) {
    return this.request<Record<string, unknown>>(
      '/internal/v1/survey/admin/stats',
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async getSurveyResults(actor: AuthenticatedUser) {
    return this.request<{
      disabled: boolean;
      flights: Array<Record<string, unknown>>;
    }>('/internal/v1/survey/results/search', {
      method: 'POST',
      body: JSON.stringify({ actor: actorContext(actor) }),
    });
  }

  async getSurveyComments(actor: AuthenticatedUser, flightInstanceId: string) {
    return this.request<{ comments: string[] }>(
      `/internal/v1/survey/results/${encodeURIComponent(flightInstanceId)}/comments`,
      { method: 'POST', body: JSON.stringify({ actor: actorContext(actor) }) },
    );
  }

  async getPublicSurveyInvite(token: string) {
    return this.request<Record<string, unknown>>(
      `/internal/v1/survey/public/${encodeURIComponent(token)}`,
    );
  }

  async submitSurveyResponse(token: string, input: SubmitSurveyResponseDto) {
    return this.request<{ submitted: boolean }>(
      `/internal/v1/survey/public/${encodeURIComponent(token)}`,
      { method: 'POST', body: JSON.stringify({ input }) },
    );
  }

  private deleteSiteResource(actor: AuthenticatedUser, path: string) {
    return this.request<{ id: string }>(path, {
      method: 'DELETE',
      body: JSON.stringify({ actor: actorContext(actor) }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.EXPERIENCE_REQUEST_TIMEOUT_MS ?? 3000),
    );
    try {
      const response = await fetch(
        `${process.env.EXPERIENCE_SERVICE_URL ?? 'http://experience-service:3300'}${path}`,
        {
          ...init,
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'x-internal-token': process.env.EXPERIENCE_INTERNAL_TOKEN ?? '',
            ...init.headers,
          },
        },
      );
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw this.remoteError(response.status, body);
      if (!isInternalEnvelope(body) || !body.success) throw this.unavailable();
      return body.data as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw this.unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private remoteError(status: number, body: unknown): HttpException {
    const error =
      typeof body === 'object' && body !== null
        ? (body as InternalErrorBody)
        : {};
    const payload = {
      code: error.code ?? ErrorCode.EXPERIENCE_UNAVAILABLE,
      message: error.message ?? 'خطای ارتباط با سرویس تجربه کاربری.',
    };
    if (status === 400) return new BadRequestException(payload);
    if (status === 403) return new ForbiddenException(payload);
    if (status === 404) return new NotFoundException(payload);
    if (status === 409) return new ConflictException(payload);
    return this.unavailable();
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: ErrorCode.EXPERIENCE_UNAVAILABLE,
      message: 'سرویس تجربه کاربری موقتاً در دسترس نیست.',
    });
  }
}
