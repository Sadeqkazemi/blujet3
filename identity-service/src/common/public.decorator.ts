import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ENDPOINT = Symbol('identity-public-endpoint');
export const Public = () => SetMetadata(PUBLIC_ENDPOINT, true);
