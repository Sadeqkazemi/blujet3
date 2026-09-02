import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ENDPOINT = 'experience-public-endpoint';
export const Public = () => SetMetadata(PUBLIC_ENDPOINT, true);
