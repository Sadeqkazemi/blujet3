import { IsUUID } from 'class-validator';

export class SandboxImpersonationDto {
  @IsUUID()
  targetUserId!: string;
}
