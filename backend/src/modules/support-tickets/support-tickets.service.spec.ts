import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupportTicketStatus } from '../../database/enums';
import { SupportTicketsService } from './support-tickets.service';

const ACTOR = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'USER',
  fullName: 'کاربر آزمون',
} as const;

function buildService(ticket: Record<string, unknown> | null) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(ticket),
    getMany: jest.fn().mockResolvedValue([ticket]),
  };
  const ticketRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    findOne: jest.fn().mockResolvedValue(ticket),
    find: jest.fn().mockResolvedValue(ticket ? [ticket] : []),
    save: jest
      .fn()
      .mockImplementation((value: unknown) => Promise.resolve(value)),
  };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({ phone: '+989121234567' }),
  };
  const storedFileRepo = {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SupportTicketsService(
    ticketRepo as never,
    userRepo as never,
    storedFileRepo as never,
    audit as never,
    { list: jest.fn() } as never,
  );
  return { service, ticketRepo, storedFileRepo, qb };
}

describe('SupportTicketsService conversations', () => {
  const baseTicket = () => ({
    id: '22222222-2222-4222-8222-222222222222',
    trackingCode: 'TK12345678',
    subject: 'پیگیری خرید',
    body: 'متن اولیه',
    requesterName: 'کاربر آزمون',
    requesterPhone: '+989121234567',
    status: SupportTicketStatus.OPEN,
    history: [
      {
        step: 'submitted',
        labelFa: 'ثبت تیکت توسط کاربر',
        at: '2026-08-27T08:00:00.000Z',
      },
    ],
    attachments: [],
    createdAt: new Date('2026-08-27T08:00:00.000Z'),
    updatedAt: new Date('2026-08-27T08:00:00.000Z'),
  });

  it('appends an owned requester reply and exposes a chronological conversation', async () => {
    const ticket = baseTicket();
    const { service, ticketRepo } = buildService(ticket);

    const result = await (
      service as unknown as {
        replyMine: (
          actor: typeof ACTOR,
          id: string,
          dto: { body: string; attachmentIds?: string[] },
        ) => Promise<{
          conversation: Array<{ body: string; senderType: string }>;
        }>;
      }
    ).replyMine(ACTOR, ticket.id, { body: 'پاسخ مشتری' });

    expect(ticketRepo.save).toHaveBeenCalled();
    expect(result.conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: 'متن اولیه', senderType: 'REQUESTER' }),
        expect.objectContaining({
          body: 'پاسخ مشتری',
          senderType: 'REQUESTER',
        }),
      ]),
    );
  });

  it('rejects replies to closed tickets', async () => {
    const ticket = { ...baseTicket(), status: SupportTicketStatus.CLOSED };
    const { service } = buildService(ticket);

    await expect(
      (
        service as unknown as {
          replyMine: (
            actor: typeof ACTOR,
            id: string,
            dto: { body: string },
          ) => Promise<unknown>;
        }
      ).replyMine(ACTOR, ticket.id, { body: 'پاسخ دیرهنگام' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closes an answered ticket after positive requester feedback without changing its tracking code', async () => {
    const ticket = { ...baseTicket(), status: SupportTicketStatus.ANSWERED };
    const { service, ticketRepo } = buildService(ticket);

    const result = await service.feedbackMine(ACTOR, ticket.id, true);

    expect(ticket.status).toBe(SupportTicketStatus.CLOSED);
    expect(ticket.trackingCode).toBe('TK12345678');
    expect(ticket.history).toEqual(
      expect.arrayContaining([expect.objectContaining({ step: 'satisfied' })]),
    );
    expect(ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(result.trackingCode).toBe('TK12345678');
  });

  it('reopens an answered ticket after negative requester feedback and preserves its assignee', async () => {
    const ticket = {
      ...baseTicket(),
      status: SupportTicketStatus.ANSWERED,
      forwardedToId: 'assigned-manager-id',
    };
    const { service } = buildService(ticket);

    await service.feedbackMine(ACTOR, ticket.id, false);

    expect(ticket.status).toBe(SupportTicketStatus.OPEN);
    expect(ticket.forwardedToId).toBe('assigned-manager-id');
    expect(ticket.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: 'dissatisfied' }),
      ]),
    );
  });

  it('does not accept satisfaction feedback before a staff answer', async () => {
    const ticket = baseTicket();
    const { service } = buildService(ticket);

    await expect(
      service.feedbackMine(ACTOR, ticket.id, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('automatically closes answered tickets after five days without requester activity', async () => {
    const ticket = {
      ...baseTicket(),
      status: SupportTicketStatus.ANSWERED,
      updatedAt: new Date('2026-08-20T08:00:00.000Z'),
    };
    const { service, ticketRepo } = buildService(ticket);

    await service.autoCloseAnsweredTickets(
      new Date('2026-08-27T08:00:00.000Z'),
    );

    expect(ticket.status).toBe(SupportTicketStatus.CLOSED);
    expect(ticket.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: 'auto_closed' }),
      ]),
    );
    expect(ticketRepo.save).toHaveBeenCalledWith(ticket);
  });

  it('records a staff reply and marks the ticket answered', async () => {
    const ticket = baseTicket();
    const { service } = buildService(ticket);
    const staff = {
      ...ACTOR,
      role: 'SITE_ADMIN' as const,
      fullName: 'پشتیبان آزمون',
    };

    const result = await service.replyAsStaff(staff, ticket.id, {
      body: 'پاسخ پشتیبانی',
    });

    expect(ticket.status).toBe(SupportTicketStatus.ANSWERED);
    expect(result.conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: 'پاسخ پشتیبانی', senderType: 'STAFF' }),
      ]),
    );
  });

  it('does not expose an unassigned ticket to an employee', async () => {
    const ticket = { ...baseTicket(), forwardedToId: null };
    const { service } = buildService(ticket);
    const employee = {
      ...ACTOR,
      role: 'EMPLOYEE' as const,
      fullName: 'کارمند آزمون',
    };

    await expect(service.detail(employee, ticket.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('scopes the employee ticket list to tickets forwarded to that employee', async () => {
    const ticket = { ...baseTicket(), forwardedToId: ACTOR.id };
    const { service, ticketRepo } = buildService(ticket);
    const employee = { ...ACTOR, role: 'EMPLOYEE' as const };

    await service.list(employee, {});

    expect(ticketRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { forwardedToId: ACTOR.id } }),
    );
  });

  it('scopes every non-site-admin manager to tickets forwarded to that exact account', async () => {
    const ticket = { ...baseTicket(), forwardedToId: ACTOR.id };
    const { service, ticketRepo } = buildService(ticket);
    const manager = {
      ...ACTOR,
      role: 'FINANCE_MANAGER' as const,
      isSuperAdmin: false,
    };

    await service.list(manager, {});

    expect(ticketRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { forwardedToId: ACTOR.id } }),
    );
  });

  it('does not expose another assignee ticket to a manager', async () => {
    const ticket = { ...baseTicket(), forwardedToId: 'another-staff-id' };
    const { service } = buildService(ticket);
    const manager = {
      ...ACTOR,
      role: 'COMMERCIAL_MANAGER' as const,
      isSuperAdmin: false,
    };

    await expect(service.detail(manager, ticket.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('preserves the exact staff assignee when the requester follows up', async () => {
    const ticket = { ...baseTicket(), forwardedToId: 'assigned-manager-id' };
    const { service } = buildService(ticket);

    await service.replyMine(ACTOR, ticket.id, { body: 'پاسخ دوباره مشتری' });

    expect(ticket.forwardedToId).toBe('assigned-manager-id');
    expect(ticket.status).toBe(SupportTicketStatus.OPEN);
  });

  it('rejects a requester attachment not owned by that account', async () => {
    const ticket = baseTicket();
    const { service } = buildService(ticket);

    await expect(
      service.replyMine(ACTOR, ticket.id, {
        body: 'پاسخ همراه فایل',
        attachmentIds: ['33333333-3333-4333-8333-333333333333'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns not found when the requested ticket is not owned by this customer or agency', async () => {
    const { service, qb } = buildService(null);

    await expect(
      service.getMine(ACTOR, 'another-account-ticket'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(qb.where).toHaveBeenCalledWith(
      '(t."userId" = :userId OR (t."userId" IS NULL AND t."requesterPhone" = :phone))',
      { userId: ACTOR.id, phone: '+989121234567' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('t.id = :id', {
      id: 'another-account-ticket',
    });
  });

  it('lets the exact assigned manager reply again after a requester follow-up', async () => {
    const assignedManager = {
      ...ACTOR,
      id: 'assigned-manager-id',
      role: 'FINANCE_MANAGER' as const,
      fullName: 'مدیر مالی',
      isSuperAdmin: false,
    };
    const ticket = {
      ...baseTicket(),
      forwardedToId: assignedManager.id,
    };
    const { service } = buildService(ticket);

    await service.replyMine(ACTOR, ticket.id, { body: 'پیگیری مجدد مشتری' });
    const result = await service.replyAsStaff(assignedManager, ticket.id, {
      body: 'پاسخ مجدد مدیر ارجاع‌گیرنده',
    });

    expect(
      result.conversation.map((message) => [message.senderType, message.body]),
    ).toEqual([
      ['REQUESTER', 'متن اولیه'],
      ['REQUESTER', 'پیگیری مجدد مشتری'],
      ['STAFF', 'پاسخ مجدد مدیر ارجاع‌گیرنده'],
    ]);
    expect(ticket.forwardedToId).toBe(assignedManager.id);
    expect(ticket.status).toBe(SupportTicketStatus.ANSWERED);
  });
});
