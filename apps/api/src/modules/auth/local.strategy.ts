import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { AuthUser } from '../../common/types/auth';
import { AuthService } from './auth.service';

/** Passport local strategy: authenticates {identifier, password} and returns the principal. */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'identifier', passwordField: 'password' });
  }

  validate(identifier: string, password: string): Promise<AuthUser> {
    return this.auth.validateUser(identifier, password);
  }
}
