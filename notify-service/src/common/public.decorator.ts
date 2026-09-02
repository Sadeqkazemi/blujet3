import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ENDPOINT = 'notify:public-endpoint';
export const Public = () => SetMetadata(PUBLIC_ENDPOINT, true);
