import { IsString, Length } from 'class-validator';

export class AgencyDlqDecisionDto {
  @IsString()
  @Length(2, 128)
  operatorId!: string;

  @IsString()
  @Length(5, 500)
  reason!: string;
}
