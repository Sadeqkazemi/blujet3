import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AgencyBulletinsController } from './agency-bulletins.controller';

describe('AgencyBulletinsController access', () => {
  it('keeps every bulletin management endpoint site-admin only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AgencyBulletinsController)).toEqual([
      'SITE_ADMIN',
    ]);
  });
});
