import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '../../common/redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './local.strategy';
import { PasswordService } from './password.service';
import { SessionSerializer } from './session.serializer';
import { SessionService } from './session.service';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [PassportModule.register({ session: true }), RedisModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    TwoFactorService,
    LocalStrategy,
    SessionSerializer,
  ],
  exports: [AuthService, PasswordService, SessionService, TwoFactorService],
})
export class AuthModule {}
