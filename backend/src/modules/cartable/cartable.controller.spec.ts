import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { CartableController } from './cartable.controller';

describe('CartableController access', () => {
  it('keeps the IT manager authorized for the unified cartable endpoints', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CartableController)).toContain(
      'IT_MANAGER',
    );
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method -- only decorator metadata is inspected
      Reflect.getMetadata(ROLES_KEY, CartableController.prototype.list),
    ).toContain('IT_MANAGER');
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method -- only decorator metadata is inspected
      Reflect.getMetadata(ROLES_KEY, CartableController.prototype.getById),
    ).toContain('IT_MANAGER');
  });

  it('keeps every internal staff role authorized at controller scope', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      CartableController,
    ) as string[];
    expect(roles).toEqual(
      expect.arrayContaining([
        'EMPLOYEE',
        'IT_MANAGER',
        'OPERATIONS_MANAGER',
        'FINANCE_MANAGER',
        'COMMERCIAL_MANAGER',
        'SITE_ADMIN',
      ]),
    );
    expect(roles).not.toContain('USER');
    expect(roles).not.toContain('AGENCY');
  });
});
