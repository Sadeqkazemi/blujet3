import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const OpsAdminAssigneeId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    const value = request.headers['x-ops-admin-assignee-id'];
    return typeof value === 'string' ? value : undefined;
  },
);
