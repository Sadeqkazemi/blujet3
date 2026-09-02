import { ApiProperty } from '@nestjs/swagger';

/** Shared response envelope: { success, data?, error? } — used on every endpoint. */
export class ApiErrorDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code: string;

  @ApiProperty({ example: 'ورودی نامعتبر است' })
  message: string;
}

export class ApiResponseDto<T> {
  @ApiProperty()
  success: boolean;

  data?: T;

  @ApiProperty({ type: ApiErrorDto, required: false })
  error?: ApiErrorDto;
}
