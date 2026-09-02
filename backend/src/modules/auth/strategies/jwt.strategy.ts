import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';

interface AccessTokenPayload {
  sub: string;
  role: AuthenticatedUser['role'];
  fullName: string;
  isSuperAdmin?: boolean;
  sandboxOwnerId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET!,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      role: payload.role,
      fullName: payload.fullName,
      isSuperAdmin: payload.isSuperAdmin === true,
      sandboxOwnerId: payload.sandboxOwnerId,
    };
  }
}
