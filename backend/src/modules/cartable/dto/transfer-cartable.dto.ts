import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class TransferCartableDto {
  @ApiProperty({ description: 'شناسه مدیر مقصد انتقال' })
  @IsUUID()
  toId: string;

  @ApiProperty({ description: 'نظر مدیر — الزامی، مطابق طراحی' })
  @IsString()
  @MinLength(1, { message: 'برای ثبت تصمیم، درج نظر مدیر الزامی است.' })
  note: string;
}
