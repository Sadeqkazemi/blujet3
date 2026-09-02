import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AgencyApiScope } from '../../database/enums';
import {
  PARTNER_API_SCOPES,
  type PartnerApiContext,
  type PartnerApiRequest,
} from './partner-api-key.guard';

export const PartnerScopes = (...scopes: AgencyApiScope[]) =>
  SetMetadata(PARTNER_API_SCOPES, scopes);

export const CurrentPartner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PartnerApiContext => {
    const request = context.switchToHttp().getRequest<PartnerApiRequest>();
    if (!request.partnerApi) {
      throw new Error(
        'Partner API context is unavailable after authentication',
      );
    }
    return request.partnerApi;
  },
);
