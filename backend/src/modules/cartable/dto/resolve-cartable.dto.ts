import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResolveCartableDto {
  @ApiProperty({ description: 'نظر مدیر — الزامی، مطابق طراحی' })
  @IsString()
  @MinLength(1, { message: 'برای ثبت تصمیم، درج نظر مدیر الزامی است.' })
  note: string;
}
