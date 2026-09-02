import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestPasswordResetEmailDto {
  @ApiProperty({
    example: 'negar@example.com',
    description: 'ایمیل تأییدشدهٔ حساب',
  })
  @IsEmail()
  email: string;
}
