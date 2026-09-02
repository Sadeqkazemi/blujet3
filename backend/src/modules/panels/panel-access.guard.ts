import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PanelsService } from './panels.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Blocks a role's own endpoints when CEO/Senior Manager has toggled that
 * role's panel off (see PANEL_ACCESS_TOGGLE_RIGHTS) — the toggle must be
 * enforced server-side, not just hidden in the frontend.
 */
@Injectable()
export class PanelAccessGuard implements CanActivate {
  constructor(private readonly panels: PanelsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return true;
    if (user.isSuperAdmin) return true;

    await this.panels.assertPanelEnabledForSelf(user.role);
    await this.panels.assertCustomPermissionForRequest(
      user,
      request.originalUrl,
    );
    return true;
  }
}
