import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ENDPOINT = 'pss:public-endpoint';
export const Public = () => SetMetadata(PUBLIC_ENDPOINT, true);
