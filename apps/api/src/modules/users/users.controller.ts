import { Body, Controller, HttpCode, Ip, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '@exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('me/change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<{ user: SessionUser }> {
    return this.users.changePassword(user, dto.currentPassword, dto.newPassword, {
      sessionId: req.sessionID,
      ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
