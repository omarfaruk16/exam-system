import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './local.strategy';
import { PasswordService } from './password.service';
import { SessionSerializer } from './session.serializer';
import { SessionService } from './session.service';

@Module({
  imports: [PassportModule.register({ session: true })],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, LocalStrategy, SessionSerializer],
  exports: [AuthService, PasswordService, SessionService],
})
export class AuthModule {}
