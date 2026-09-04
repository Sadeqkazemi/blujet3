import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from './errors';

class ErrorDetails {
  @ApiProperty({ enum: ErrorCode }) code!: ErrorCode;
  @ApiProperty({
    description: 'پیام امن فارسی',
    example: 'درخواست قابل پردازش نیست.',
  })
  message!: string;
}
export class ErrorResponse {
  @ApiProperty({ example: false }) success!: boolean;
  @ApiProperty({ type: ErrorDetails }) error!: ErrorDetails;
}
