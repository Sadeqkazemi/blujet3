import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Not,
  Raw,
  Repository,
} from 'typeorm';
import { CartableTask } from '../../database/entities/cartable-task.entity';
import { ChairReportPermission } from '../../database/entities/chair-report-permission.entity';
import { ManagerReferral } from '../../database/entities/manager-referral.entity';
import { ManagerReferralReport } from '../../database/entities/manager-referral-report.entity';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { findOneOrThrow } from '../../database/utils/find-one-or-throw';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../../common/errors';
import { ROLE_LABELS_FA, STAFF_ROLES } from '../../common/exec-roles';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  CartableCategory,
  CartableStatus,
  Role,
} from '../../database/enums';
import { CartableProjectionEventService } from './cartable-projection-event.service';

@Injectable()
export class CartableService {
  private static readonly INTERNAL_CONVERSATION_TTL_MS =
    4 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(CartableTask)
    private readonly taskRepo: Repository<CartableTask>,
    @InjectRepository(ChairReportPermission)
    private readonly chairPermissionRepo: Repository<ChairReportPermission>,
    @InjectRepository(ManagerReferral)
    private readonly managerReferralRepo: Repository<ManagerReferral>,
    @InjectRepository(ManagerReferralReport)
    private readonly managerReferralReportRepo: Repository<ManagerReferralReport>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(StoredFile)
    private readonly storedFileRepo: Repository<StoredFile>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly projectionEvents: CartableProjectionEventService,
  ) {}

  private responseTask(
    task: CartableTask,
  ): Omit<CartableTask, 'version' | 'generateId'> {
    const { version, ...response } = task;
    void version;
    return response;
  }

  private async getOwnOpenTaskOrThrow(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<CartableTask> {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مورد کارتابل یافت نشد.',
      });
    }
    // Ownership before state: someone else's task is a 403/404 concern, not 409.
    if (task.assigneeId !== actor.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'این مورد در کارتابل شما نیست.',
      });
    }
    if (task.status !== 'OPEN') {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'این مورد قبلاً بررسی شده است.',
      });
    }
    return task;
  }

  private isInternalMessage(task: CartableTask): boolean {
    return (
      task.sourceType === 'MANAGER_MESSAGE' ||
      task.sourceType === 'EMPLOYEE_MESSAGE'
    );
  }

  /**
   * Deterministic lazy sweep: every cartable read archives conversations whose
   * last message is older than four days. This avoids a process-local timer and
   * works consistently across multiple backend replicas.
   */
  private async closeInactiveInternalConversations(now = new Date()) {
    const threshold = new Date(
      now.getTime() - CartableService.INTERNAL_CONVERSATION_TTL_MS,
    );
    const rows = await this.taskRepo
      .createQueryBuilder('task')
      .select('task.conversationId', 'conversationId')
      .where('task.conversationId IS NOT NULL')
      .andWhere('task.status = :openStatus', { openStatus: 'OPEN' })
      .andWhere('task.sourceType IN (:...sourceTypes)', {
        sourceTypes: ['MANAGER_MESSAGE', 'EMPLOYEE_MESSAGE'],
      })
      .groupBy('task.conversationId')
      .having('MAX(task.createdAt) <= :threshold', { threshold })
      .getRawMany<{ conversationId: string }>();
    const conversationIds = rows
      .map((row) => row.conversationId)
      .filter(Boolean);
    if (conversationIds.length === 0) return;

    await this.taskRepo.manager.transaction(async (tx) => {
      const tasks = await tx
        .createQueryBuilder(CartableTask, 'task')
        .addSelect('task.version')
        .setLock('pessimistic_write')
        .where('task.conversationId IN (:...conversationIds)', {
          conversationIds,
        })
        .andWhere('task.sourceType IN (:...sourceTypes)', {
          sourceTypes: ['MANAGER_MESSAGE', 'EMPLOYEE_MESSAGE'],
        })
        .andWhere('task.status = :status', { status: 'OPEN' })
        .orderBy('task.id', 'ASC')
        .getMany();
      for (const task of tasks) {
        task.status = 'APPROVED';
        task.resolutionNote = 'بسته‌شدن خودکار پس از ۴ روز عدم فعالیت';
        task.resolvedAt = now;
        const saved = await tx.save(task);
        await this.projectionEvents.record(tx, saved, 'AUTO_ARCHIVED');
      }
    });
  }

  private isActiveStaff(user: User | null | undefined): user is User {
    return Boolean(
      user?.isActive &&
      STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number]),
    );
  }

  private async assertOwnedAttachments(
    actorId: string,
    attachmentIds: string[] | undefined,
  ) {
    if (!attachmentIds?.length) return;
    const owned = await this.storedFileRepo.count({
      where: { id: In(attachmentIds), ownerId: actorId },
    });
    if (owned !== attachmentIds.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فایل پیوست معتبر نیست.',
      });
    }
  }

  async list(
    actor: AuthenticatedUser,
    query: {
      category?: CartableCategory;
      date?: string;
      status?: CartableStatus;
    },
  ) {
    await this.closeInactiveInternalConversations();
    const status = query.status ?? 'OPEN';
    const where: FindOptionsWhere<CartableTask> = {
      assigneeId: actor.id,
      status,
    };
    if (query.category) where.category = query.category;
    if (query.date) {
      const start = new Date(query.date);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.createdAt = Raw(
        (alias) => `${alias} >= :start AND ${alias} < :end`,
        {
          start,
          end,
        },
      );
    }

    const [tasks, countRows, statusRows] = await Promise.all([
      this.taskRepo.find({
        where,
        relations: { sender: true },
        select: { sender: { fullName: true, role: true } },
        order: { createdAt: 'DESC' },
      }),
      // KPI cards always show OPEN counts per category, unfiltered by the
      // table's own category/date selection (matches the design).
      this.taskRepo
        .createQueryBuilder('t')
        .select('t.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('t.assigneeId = :assigneeId', { assigneeId: actor.id })
        .andWhere('t.status = :status', { status: 'OPEN' })
        .groupBy('t.category')
        .getRawMany<{
          category: 'ADMIN' | 'AGENCY' | 'MANAGER';
          count: string;
        }>(),
      this.taskRepo
        .createQueryBuilder('t')
        .select('t.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('t.assigneeId = :assigneeId', { assigneeId: actor.id })
        .groupBy('t.status')
        .getRawMany<{
          status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'TRANSFERRED';
          count: string;
        }>(),
    ]);

    const counts = { ADMIN: 0, AGENCY: 0, MANAGER: 0 };
    for (const row of countRows) counts[row.category] = parseInt(row.count, 10);
    const statusCounts = { OPEN: 0, APPROVED: 0, REJECTED: 0, TRANSFERRED: 0 };
    for (const row of statusRows)
      statusCounts[row.status] = parseInt(row.count, 10);

    return {
      tasks: tasks.map((task) => this.responseTask(task)),
      counts,
      statusCounts,
      totalOpen: counts.ADMIN + counts.AGENCY + counts.MANAGER,
    };
  }

  /** Detail view — self-scoped like list(), any status (so resolved items
   * stay reachable), plus per-task audit history. First view marks the
   * task read; repeat views are a no-op (idempotent). */
  async getById(actor: AuthenticatedUser, id: string) {
    await this.closeInactiveInternalConversations();
    const task = await this.taskRepo.findOne({
      where: [
        { id, assigneeId: actor.id },
        { id, senderId: actor.id },
      ],
      relations: { sender: true, transferredTo: true },
      select: {
        sender: { id: true, fullName: true, role: true },
        transferredTo: { id: true, fullName: true },
      },
    });
    if (!task) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'مورد کارتابل یافت نشد.',
      });
    }

    if (task.assigneeId === actor.id && !task.readAt) {
      const now = new Date();
      const marked = await this.taskRepo.manager.transaction(async (tx) => {
        const locked = await tx
          .createQueryBuilder(CartableTask, 'task')
          .addSelect('task.version')
          .setLock('pessimistic_write')
          .where('task.id = :id', { id })
          .andWhere('task.assigneeId = :assigneeId', {
            assigneeId: actor.id,
          })
          .andWhere('task.readAt IS NULL')
          .getOne();
        if (!locked) return null;
        locked.readAt = now;
        const saved = await tx.save(locked);
        await this.projectionEvents.record(tx, saved, 'READ');
        return saved;
      });
      if (marked) {
        task.readAt = marked.readAt;
        task.version = marked.version;
      }
    }

    // The task's own lifecycle events (created implicitly, then whatever
    // resolve()/transfer() logged with entityType 'CartableTask') — not the
    // linked source entity's separate history (e.g. AgencyMembershipRequest
    // exposes its own full trail via GET /agencies/requests/:id).
    const conversationTasks = task.conversationId
      ? await this.taskRepo.find({
          where: { conversationId: task.conversationId },
          relations: { sender: true },
          select: {
            sender: { id: true, fullName: true, role: true },
          },
          order: { createdAt: 'ASC' },
        })
      : [task];
    const taskIds = conversationTasks.map((row) => row.id);
    const auditHistory = await this.auditLogRepo.find({
      where: { entityType: 'CartableTask', entityId: In(taskIds) },
      order: { createdAt: 'ASC' },
    });

    const allAttachmentIds = [
      ...new Set(
        conversationTasks.flatMap((row) =>
          Array.isArray(row.attachments)
            ? row.attachments.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
        ),
      ),
    ];
    const files = allAttachmentIds.length
      ? await this.storedFileRepo.findBy({ id: In(allAttachmentIds) })
      : [];
    const byId = new Map(files.map((file) => [file.id, file]));
    const attachmentMetadata = (ids: string[] | null) =>
      (Array.isArray(ids) ? ids : []).flatMap((fileId) => {
        const file = byId.get(fileId);
        return file
          ? [
              {
                id: file.id,
                fileName: file.fileName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
              },
            ]
          : [];
      });

    const history = [
      ...conversationTasks.map((row, index) => ({
        id: `message-${row.id}`,
        action: index === 0 ? 'ثبت و ارسال پیام' : 'پاسخ به پیام',
        detail: row.description,
        actorLabel: row.senderLabelFa ?? row.sender?.fullName ?? null,
        actorRole: row.sender?.role ?? null,
        attachments: attachmentMetadata(row.attachments),
        createdAt: row.createdAt,
      })),
      ...auditHistory.map((entry) => ({
        id: entry.id,
        action: entry.action,
        detail: entry.detail,
        actorLabel: null,
        actorRole: entry.actorRole,
        attachments: [],
        createdAt: entry.createdAt,
      })),
    ].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    );

    const attachments = attachmentMetadata(task.attachments);

    return { ...this.responseTask(task), attachments, history };
  }

  /** Badge count for "کارتابل من" — never-viewed tasks regardless of
   * status, so a resolved-but-unseen item still counts. */
  async unreadCount(actor: AuthenticatedUser) {
    await this.closeInactiveInternalConversations();
    const count = await this.taskRepo.count({
      where: { assigneeId: actor.id, readAt: IsNull() },
    });
    return { count };
  }

  /** Side effects of resolving a task, keyed by its source link. */
  private async applySourceEffects(
    actor: AuthenticatedUser,
    task: CartableTask,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ) {
    // The recipient's review of a referral task doubles as the report
    // submission surface (⚑ in docs/DB_SCHEMA.md): approving submits the
    // note as the report; rejecting resolves the task without one.
    if (
      task.sourceType === 'MANAGER_REFERRAL' &&
      task.sourceId &&
      decision === 'APPROVED'
    ) {
      const referral = await this.managerReferralRepo
        .createQueryBuilder('r')
        .where('r.id = :id', { id: task.sourceId })
        .getOne();
      if (referral && referral.status !== 'CLOSED') {
        await this.managerReferralReportRepo.save(
          this.managerReferralReportRepo.create({
            referralId: referral.id,
            fromId: actor.id,
            body: note,
          }),
        );
        await this.managerReferralRepo.update(
          { id: referral.id },
          { status: 'REPORTED' },
        );
      }
    }
  }

  private async resolve(
    actor: AuthenticatedUser,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ) {
    const task = await this.getOwnOpenTaskOrThrow(actor, id);

    if (task.sourceType === 'CHAIR_PERMISSION' && task.sourceId) {
      await this.taskRepo.manager.transaction(async (tx) => {
        const permission = await tx
          .createQueryBuilder(ChairReportPermission, 'permission')
          .setLock('pessimistic_write')
          .where('permission.id = :id', { id: task.sourceId })
          .getOne();
        if (!permission || permission.status !== 'PENDING') {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'این درخواست قبلاً بررسی شده است.',
          });
        }
        const now = new Date();
        permission.status = decision;
        permission.decidedById = actor.id;
        permission.decidedAt = now;
        await tx.save(permission);
        const tasks = await tx
          .createQueryBuilder(CartableTask, 'task')
          .addSelect('task.version')
          .setLock('pessimistic_write')
          .where('task.sourceType = :sourceType', {
            sourceType: 'CHAIR_PERMISSION',
          })
          .andWhere('task.sourceId = :sourceId', { sourceId: task.sourceId })
          .andWhere('task.status = :status', { status: 'OPEN' })
          .orderBy('task.id', 'ASC')
          .getMany();
        for (const relatedTask of tasks) {
          relatedTask.status = decision;
          relatedTask.resolutionNote = note;
          relatedTask.resolvedAt = now;
          const saved = await tx.save(relatedTask);
          await this.projectionEvents.record(tx, saved, 'RESOLVED');
        }
      });
    } else {
      await this.taskRepo.manager.transaction(async (tx) => {
        const locked = await tx
          .createQueryBuilder(CartableTask, 'task')
          .addSelect('task.version')
          .setLock('pessimistic_write')
          .where('task.id = :id', { id })
          .andWhere('task.status = :status', { status: 'OPEN' })
          .getOne();
        if (!locked) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'این مورد قبلاً بررسی شده است.',
          });
        }
        locked.status = decision;
        locked.resolutionNote = note;
        locked.resolvedAt = new Date();
        const saved = await tx.save(locked);
        await this.projectionEvents.record(tx, saved, 'RESOLVED');
      });

      await this.applySourceEffects(actor, task, decision, note);
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action:
        decision === 'APPROVED' ? 'تأیید مورد کارتابل' : 'رد مورد کارتابل',
      detail: `«${task.title}» توسط ${actor.fullName} ${decision === 'APPROVED' ? 'تأیید' : 'رد'} شد. نظر مدیر: ${note}`,
      entityType: 'CartableTask',
      entityId: id,
    });

    return this.responseTask(
      await findOneOrThrow(this.taskRepo, { where: { id } }),
    );
  }

  approve(actor: AuthenticatedUser, id: string, note: string) {
    return this.resolve(actor, id, 'APPROVED', note);
  }

  reject(actor: AuthenticatedUser, id: string, note: string) {
    return this.resolve(actor, id, 'REJECTED', note);
  }

  async transfer(
    actor: AuthenticatedUser,
    id: string,
    toId: string,
    note: string,
  ) {
    const task = await this.getOwnOpenTaskOrThrow(actor, id);

    const target = await this.userRepo.findOneBy({ id: toId });
    if (
      !target ||
      !target.isActive ||
      !STAFF_ROLES.includes(target.role as (typeof STAFF_ROLES)[number]) ||
      target.id === actor.id
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'مدیر مقصد انتقال معتبر نیست.',
      });
    }

    const newTask = await this.taskRepo.manager.transaction(async (tx) => {
      const locked = await tx
        .createQueryBuilder(CartableTask, 'task')
        .addSelect('task.version')
        .setLock('pessimistic_write')
        .where('task.id = :id', { id })
        .andWhere('task.status = :status', { status: 'OPEN' })
        .getOne();
      if (!locked) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این مورد قبلاً بررسی شده است.',
        });
      }
      locked.status = 'TRANSFERRED';
      locked.resolutionNote = note;
      locked.transferredToId = toId;
      locked.resolvedAt = new Date();
      const transferred = await tx.save(locked);
      await this.projectionEvents.record(tx, transferred, 'TRANSFERRED');
      // The mocks toast and drop the item; the real system routes it (⚑).
      const created = await tx.save(
        tx.create(CartableTask, {
          assigneeId: toId,
          category: task.category,
          title: task.title,
          description: task.description,
          senderId: task.senderId,
          senderLabelFa: task.senderLabelFa,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          conversationId: task.conversationId,
          attachments: task.attachments,
        }),
      );
      await this.projectionEvents.record(tx, created, 'CREATED');
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'انتقال مورد کارتابل',
      detail: `«${task.title}» توسط ${actor.fullName} به ${target.fullName} منتقل شد. نظر مدیر: ${note}`,
      entityType: 'CartableTask',
      entityId: id,
      metadata: { transferredToId: toId, newTaskId: newTask.id },
    });

    await this.notifications.notify({
      recipientId: toId,
      category: 'CARTABLE',
      action: 'REFERRED',
      title: 'ارجاع مورد کارتابل',
      body: `«${task.title}» توسط ${actor.fullName} به کارتابل شما ارجاع شد.`,
      entityType: 'CartableTask',
      entityId: newTask.id,
      dedupeKey: `CartableTask:${id}:REFERRED:${toId}`,
    });

    return this.responseTask(newTask);
  }

  // ── Chairman permission gate (Finance/Commercial only) ─────────────────

  async requestChairPermission(actor: AuthenticatedUser) {
    const existing = await this.chairPermissionRepo.findOneBy({
      requesterId: actor.id,
      status: In(['PENDING', 'APPROVED']),
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message:
          existing.status === 'PENDING'
            ? 'درخواست قبلی شما هنوز در انتظار تأیید است.'
            : 'مجوز شما قبلاً تأیید شده است.',
      });
    }

    const chairs = await this.userRepo.findBy({
      role: 'BOARD_CHAIR',
      isActive: true,
    });
    if (chairs.length === 0) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'حساب رئیس هیئت مدیره در دسترس نیست.',
      });
    }

    const request = await this.chairPermissionRepo.manager.transaction(
      async (tx) => {
        const created = await tx.save(
          tx.create(ChairReportPermission, { requesterId: actor.id }),
        );
        const tasks = await tx.save(
          chairs.map((chair) =>
            tx.create(CartableTask, {
              assigneeId: chair.id,
              category: 'MANAGER',
              title: 'درخواست مجوز ارسال گزارش به رئیس هیئت مدیره',
              description: `${actor.fullName} درخواست مجوز ارسال گزارش مستقیم به رئیس هیئت مدیره را دارد.`,
              senderId: actor.id,
              sourceType: 'CHAIR_PERMISSION',
              sourceId: created.id,
            }),
          ),
        );
        for (const task of tasks) {
          await this.projectionEvents.record(tx, task, 'CREATED');
        }
        return created;
      },
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'ACCESS',
      action: 'درخواست مجوز از رئیس هیئت مدیره',
      detail: `${actor.fullName} درخواست مجوز ارسال گزارش به رئیس هیئت مدیره را ثبت کرد.`,
      entityType: 'ChairReportPermission',
      entityId: request.id,
    });

    return request;
  }

  async getChairPermission(actor: AuthenticatedUser) {
    const latest = await this.chairPermissionRepo.findOne({
      where: { requesterId: actor.id },
      order: { createdAt: 'DESC' },
    });
    // Wrapped: the shared response envelope treats a bare null data as an
    // error, and "no request yet" is a perfectly valid state.
    return { latest };
  }

  // ── Internal API for sibling modules (referrals/messages/agencies) ─────

  /** Close every OPEN cartable item pointing at a structured source. */
  async resolveOpenBySource(
    sourceType: 'AGENCY_REQUEST',
    sourceId: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
    manager?: EntityManager,
  ) {
    const resolveTasks = async (tx: EntityManager) => {
      const tasks = await tx
        .createQueryBuilder(CartableTask, 'task')
        .addSelect('task.version')
        .setLock('pessimistic_write')
        .where('task.sourceType = :sourceType', { sourceType })
        .andWhere('task.sourceId = :sourceId', { sourceId })
        .andWhere('task.status = :status', { status: 'OPEN' })
        .orderBy('task.id', 'ASC')
        .getMany();
      const resolvedAt = new Date();
      for (const task of tasks) {
        task.status = decision;
        task.resolutionNote = note;
        task.resolvedAt = resolvedAt;
        const saved = await tx.save(task);
        await this.projectionEvents.record(tx, saved, 'RESOLVED');
      }
    };
    if (manager) {
      await resolveTasks(manager);
      return;
    }
    await this.taskRepo.manager.transaction(resolveTasks);
  }

  async createTask(
    input: {
      assigneeId: string;
      category: CartableCategory;
      title: string;
      description: string;
      senderId?: string;
      senderLabelFa?: string;
      sourceType?:
        | 'MANAGER_MESSAGE'
        | 'MANAGER_REFERRAL'
        | 'AGENCY_REQUEST'
        | 'CHAIR_PERMISSION'
        | 'EMPLOYEE_MESSAGE';
      sourceId?: string;
      conversationId?: string;
      attachments?: string[];
    },
    manager?: EntityManager,
  ) {
    const create = async (tx: EntityManager) => {
      const task = await tx.save(tx.create(CartableTask, input));
      await this.projectionEvents.record(tx, task, 'CREATED');
      return task;
    };
    return manager
      ? create(manager)
      : this.taskRepo.manager.transaction(create);
  }

  /** Fans a task out to every active user holding one of the given roles. */
  async createTasksForRoles(
    roles: Role[],
    input: Omit<Parameters<CartableService['createTask']>[0], 'assigneeId'>,
    excludeUserId?: string,
  ) {
    const recipients = await this.userRepo.find({
      where: {
        role: In(roles),
        isActive: true,
        ...(excludeUserId ? { id: Not(excludeUserId) } : {}),
      },
      select: { id: true },
    });
    for (const r of recipients) {
      await this.createTask({
        ...input,
        assigneeId: r.id,
        conversationId:
          input.conversationId ??
          (input.sourceType === 'MANAGER_MESSAGE' ? randomUUID() : undefined),
      });
    }
    return recipients.length;
  }

  /** Dept → the exec manager role that owns the employee's unit. */
  private deptManagerRole(dept: string | null | undefined): Role | null {
    if (dept === 'commercial' || dept === 'sales') return 'COMMERCIAL_MANAGER';
    if (dept === 'finance') return 'FINANCE_MANAGER';
    if (dept === 'it') return 'IT_MANAGER';
    return null;
  }

  async listManagerRecipients(actor: AuthenticatedUser) {
    const employee = await findOneOrThrow(this.userRepo, {
      where: { id: actor.id },
      select: { dept: true },
    });
    const ownRole = this.deptManagerRole(employee.dept);

    const managers = await this.userRepo.find({
      where: {
        role: In([...STAFF_ROLES]),
        isActive: true,
        id: Not(actor.id),
      },
      select: { id: true, fullName: true, role: true },
      order: { fullName: 'ASC' },
    });

    return managers.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      role: m.role,
      roleLabelFa: ROLE_LABELS_FA[m.role],
      isOwnManager: ownRole !== null && m.role === ownRole,
    }));
  }

  async sendEmployeeManagerMessage(
    actor: AuthenticatedUser,
    dto: { toId: string; body: string; attachmentIds?: string[] },
  ) {
    const target = await this.userRepo.findOneBy({ id: dto.toId });
    if (
      !target ||
      !target.isActive ||
      !STAFF_ROLES.includes(target.role as (typeof STAFF_ROLES)[number]) ||
      target.id === actor.id
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'گیرندهٔ پیام معتبر نیست.',
      });
    }
    await this.assertOwnedAttachments(actor.id, dto.attachmentIds);

    const task = await this.createTask({
      assigneeId: target.id,
      category: 'MANAGER',
      title: `پیام از ${actor.fullName}`,
      description: dto.body,
      senderId: actor.id,
      senderLabelFa: `${actor.fullName} · کارمند`,
      sourceType: 'EMPLOYEE_MESSAGE',
      conversationId: randomUUID(),
      attachments: dto.attachmentIds ?? [],
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'ارسال پیام کارمند به مدیر',
      detail: `${actor.fullName} پیامی به ${target.fullName} ارسال کرد.`,
      entityType: 'CartableTask',
      entityId: task.id,
    });

    return {
      id: task.id,
      to: { id: target.id, fullName: target.fullName },
      body: dto.body,
      createdAt: task.createdAt,
    };
  }

  async sendDirectStaffMessage(
    actor: AuthenticatedUser,
    dto: {
      toId: string;
      subject: string;
      body: string;
      attachmentIds?: string[];
    },
  ) {
    const target = await this.userRepo.findOneBy({ id: dto.toId });
    if (!this.isActiveStaff(target) || target.id === actor.id) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'گیرندهٔ پیام داخلی معتبر نیست.',
      });
    }
    await this.assertOwnedAttachments(actor.id, dto.attachmentIds);

    const task = await this.createTask({
      assigneeId: target.id,
      category: 'ADMIN',
      title: dto.subject.trim(),
      description: dto.body.trim(),
      senderId: actor.id,
      senderLabelFa: `${actor.fullName} · ${ROLE_LABELS_FA[actor.role]}`,
      sourceType:
        actor.role === 'EMPLOYEE' ? 'EMPLOYEE_MESSAGE' : 'MANAGER_MESSAGE',
      conversationId: randomUUID(),
      attachments: dto.attachmentIds ?? [],
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'ارسال پیام مستقیم داخلی',
      detail: `${actor.fullName} پیام «${task.title}» را به ${target.fullName} ارسال کرد.`,
      entityType: 'CartableTask',
      entityId: task.id,
      metadata: { recipientId: target.id, conversationId: task.conversationId },
    });
    await this.notifications.notify({
      recipientId: target.id,
      category: 'CARTABLE',
      action: 'INTERNAL_MESSAGE',
      title: task.title,
      body: `پیام جدید از ${actor.fullName}`,
      entityType: 'CartableTask',
      entityId: task.id,
      dedupeKey: `CartableTask:${task.id}:INTERNAL_MESSAGE:${target.id}`,
    });

    return this.responseTask(task);
  }

  async replyToInternalMessage(
    actor: AuthenticatedUser,
    id: string,
    dto: { body: string; attachmentIds?: string[] },
  ) {
    const task = await this.getOwnOpenTaskOrThrow(actor, id);
    if (!this.isInternalMessage(task) || !task.senderId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'این مورد از نوع پیام داخلی قابل پاسخ نیست.',
      });
    }

    const target = await this.userRepo.findOneBy({ id: task.senderId });
    if (!this.isActiveStaff(target) || target.id === actor.id) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'فرستندهٔ پیام برای دریافت پاسخ در دسترس نیست.',
      });
    }
    await this.assertOwnedAttachments(actor.id, dto.attachmentIds);

    const conversationId = task.conversationId ?? randomUUID();
    const reply = await this.taskRepo.manager.transaction(async (tx) => {
      const locked = await tx
        .createQueryBuilder(CartableTask, 'task')
        .addSelect('task.version')
        .setLock('pessimistic_write')
        .where('task.id = :id', { id: task.id })
        .andWhere('task.assigneeId = :assigneeId', { assigneeId: actor.id })
        .andWhere('task.status = :status', { status: 'OPEN' })
        .getOne();
      if (!locked) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'این پیام قبلاً پاسخ داده شده یا بسته شده است.',
        });
      }
      locked.status = 'APPROVED';
      locked.resolutionNote = 'پاسخ ارسال شد';
      locked.resolvedAt = new Date();
      locked.conversationId = conversationId;
      const closed = await tx.save(locked);
      await this.projectionEvents.record(tx, closed, 'RESOLVED');

      const created = await tx.save(
        tx.create(CartableTask, {
          assigneeId: target.id,
          category: task.category,
          title: task.title,
          description: dto.body.trim(),
          senderId: actor.id,
          senderLabelFa: `${actor.fullName} · ${ROLE_LABELS_FA[actor.role]}`,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          conversationId,
          attachments: dto.attachmentIds ?? [],
        }),
      );
      await this.projectionEvents.record(tx, created, 'CREATED');
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'پاسخ به پیام داخلی',
      detail: `${actor.fullName} به پیام «${task.title}» پاسخ داد و مورد دریافتی را بست.`,
      entityType: 'CartableTask',
      entityId: task.id,
      metadata: {
        replyTaskId: reply.id,
        recipientId: target.id,
        conversationId,
      },
    });
    await this.notifications.notify({
      recipientId: target.id,
      category: 'CARTABLE',
      action: 'INTERNAL_REPLY',
      title: `پاسخ: ${task.title}`,
      body: `پاسخ جدید از ${actor.fullName}`,
      entityType: 'CartableTask',
      entityId: reply.id,
      dedupeKey: `CartableTask:${reply.id}:INTERNAL_REPLY:${target.id}`,
    });

    return this.responseTask(reply);
  }

  async closeInternalConversation(actor: AuthenticatedUser, id: string) {
    const task = await this.taskRepo.findOne({
      where: [
        { id, assigneeId: actor.id },
        { id, senderId: actor.id },
      ],
    });
    if (!task || !this.isInternalMessage(task) || !task.conversationId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'گفتگوی داخلی یافت نشد.',
      });
    }

    const now = new Date();
    await this.taskRepo.manager.transaction(async (tx) => {
      const tasks = await tx
        .createQueryBuilder(CartableTask, 'task')
        .addSelect('task.version')
        .setLock('pessimistic_write')
        .where('task.conversationId = :conversationId', {
          conversationId: task.conversationId,
        })
        .andWhere('task.sourceType IN (:...sourceTypes)', {
          sourceTypes: ['MANAGER_MESSAGE', 'EMPLOYEE_MESSAGE'],
        })
        .andWhere('task.status = :status', { status: 'OPEN' })
        .orderBy('task.id', 'ASC')
        .getMany();
      for (const openTask of tasks) {
        openTask.status = 'APPROVED';
        openTask.resolutionNote = 'گفتگو توسط کاربر بسته شد';
        openTask.resolvedAt = now;
        const saved = await tx.save(openTask);
        await this.projectionEvents.record(tx, saved, 'CONVERSATION_CLOSED');
      }
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      category: 'SYSTEM',
      action: 'بستن گفتگوی داخلی',
      detail: `${actor.fullName} گفتگوی «${task.title}» را بست.`,
      entityType: 'CartableTask',
      entityId: task.id,
      metadata: { conversationId: task.conversationId },
    });

    return this.getById(actor, task.id);
  }

  async listSentEmployeeManagerMessages(actor: AuthenticatedUser) {
    const rows = await this.taskRepo.find({
      where: { senderId: actor.id, sourceType: 'EMPLOYEE_MESSAGE' },
      relations: { assignee: true },
      select: { assignee: { fullName: true } },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          Array.isArray(row.attachments)
            ? row.attachments.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
        ),
      ),
    ];
    const files = ids.length
      ? await this.storedFileRepo.findBy({ id: In(ids) })
      : [];
    const byId = new Map(files.map((file) => [file.id, file]));
    return rows.map((r) => ({
      id: r.id,
      toName: r.assignee.fullName,
      body: r.description,
      attachments: (Array.isArray(r.attachments) ? r.attachments : []).flatMap(
        (id) => {
          if (typeof id !== 'string') return [];
          const file = byId.get(id);
          return file
            ? [
                {
                  id: file.id,
                  fileName: file.fileName,
                  mimeType: file.mimeType,
                  sizeBytes: file.sizeBytes,
                },
              ]
            : [];
        },
      ),
      createdAt: r.createdAt,
    }));
  }
}
