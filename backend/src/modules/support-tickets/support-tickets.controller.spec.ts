import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { MySupportTicketsController } from './my-support-tickets.controller';
import { SupportTicketsController } from './support-tickets.controller';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'USER',
  fullName: 'کاربر آزمون',
} as const;

const EMPLOYEE = {
  id: '33333333-3333-4333-8333-333333333333',
  role: 'EMPLOYEE',
  fullName: 'کارمند آزمون',
} as const;

const STAFF_ROLES = [
  'SITE_ADMIN',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'COMMERCIAL_MANAGER',
  'FINANCE_MANAGER',
  'IT_MANAGER',
  'OPERATIONS_MANAGER',
  'EMPLOYEE',
];

const SITE_ADMIN = {
  id: '44444444-4444-4444-8444-444444444444',
  role: 'SITE_ADMIN',
  fullName: 'ادمین سایت',
} as const;

describe('Support ticket reply controllers', () => {
  it('keeps requester reply routes restricted to USER and AGENCY and delegates with the actor', async () => {
    const service = {
      replyMine: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
    };
    const controller = new MySupportTicketsController(service as never);
    const dto = { body: 'پیگیری مشتری', attachmentIds: [] };

    await expect(controller.reply(USER, 'ticket-1', dto)).resolves.toEqual({
      success: true,
      data: { id: 'ticket-1' },
    });
    expect(service.replyMine).toHaveBeenCalledWith(USER, 'ticket-1', dto);
    expect(Reflect.getMetadata(ROLES_KEY, MySupportTicketsController)).toEqual([
      'USER',
      'AGENCY',
    ]);
  });

  it('allows management and employees to reply through the cartable and delegates with the actor', async () => {
    const service = {
      replyAsStaff: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
    };
    const controller = new SupportTicketsController(service as never);
    const dto = { body: 'پاسخ پشتیبانی', attachmentIds: [] };

    await expect(controller.reply(EMPLOYEE, 'ticket-1', dto)).resolves.toEqual({
      success: true,
      data: { id: 'ticket-1' },
    });
    expect(service.replyAsStaff).toHaveBeenCalledWith(
      EMPLOYEE,
      'ticket-1',
      dto,
    );
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method -- decorator metadata is read from the prototype method without invoking it
      Reflect.getMetadata(ROLES_KEY, SupportTicketsController.prototype.reply),
    ).toEqual(STAFF_ROLES);
  });

  it('passes the actor to list so employee visibility can be scoped server-side', async () => {
    const service = { list: jest.fn().mockResolvedValue([]) };
    const controller = new SupportTicketsController(service as never);

    await expect(controller.list(EMPLOYEE, 'OPEN', 'AGENCY')).resolves.toEqual({
      success: true,
      data: [],
    });
    expect(service.list).toHaveBeenCalledWith(EMPLOYEE, {
      status: 'OPEN',
      dept: 'AGENCY',
    });
  });

  it('keeps ticket creation, forwarding and status control exclusive to site admin', () => {
    const rolesFor = (methodName: string): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(
        SupportTicketsController.prototype,
        methodName,
      );
      if (!descriptor || typeof descriptor.value !== 'function') {
        throw new Error(`Missing controller method: ${methodName}`);
      }
      const controllerMethod = descriptor.value as (
        ...args: unknown[]
      ) => unknown;
      const metadata: unknown = Reflect.getMetadata(
        ROLES_KEY,
        controllerMethod,
      );
      return metadata;
    };

    expect(rolesFor('createAsAdmin')).toEqual(['SITE_ADMIN']);
    expect(rolesFor('forwardTargets')).toEqual(['SITE_ADMIN']);
    expect(rolesFor('forward')).toEqual(['SITE_ADMIN']);
    expect(rolesFor('updateStatus')).toEqual(['SITE_ADMIN']);
  });

  it('lets site admin forward an exact ticket to an exact staff account', async () => {
    const service = {
      forward: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
    };
    const controller = new SupportTicketsController(service as never);

    await expect(
      controller.forward(SITE_ADMIN, 'ticket-1', {
        targetUserId: EMPLOYEE.id,
      }),
    ).resolves.toEqual({ success: true, data: { id: 'ticket-1' } });
    expect(service.forward).toHaveBeenCalledWith(
      SITE_ADMIN,
      'ticket-1',
      EMPLOYEE.id,
    );
  });
});
