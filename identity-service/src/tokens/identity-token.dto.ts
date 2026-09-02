import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const IDENTITY_ROLES = [
  'USER',
  'AGENCY',
  'EMPLOYEE',
  'IT_MANAGER',
  'COMMERCIAL_MANAGER',
  'OPERATIONS_MANAGER',
  'FINANCE_MANAGER',
  'SENIOR_MANAGER',
  'CEO',
  'BOARD_CHAIR',
  'SITE_ADMIN',
] as const;

export class IssueIdentityTokenDto {
  @IsString()
  userId!: string;

  @IsString()
  @IsIn(IDENTITY_ROLES)
  role!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsString()
  sandboxOwnerId?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(900)
  accessTtlSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(604800)
  refreshTtlSeconds?: number;
}

export class RefreshIdentityTokenDto {
  @IsString()
  refreshToken!: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  ip?: string;
}

export class LogoutIdentityTokenDto {
  @IsString()
  refreshToken!: string;
}

export class ListIdentitySessionsDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  currentRefreshToken?: string;
}

export class RevokeIdentitySessionDto extends ListIdentitySessionsDto {
  @IsString()
  sessionId!: string;
}
