import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import type { AdminUserRow } from '@exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto, SetAdminPasswordDto, UpdateAdminUserDto } from './dto/admin-user.dto';

@Controller('admin-users')
@Roles('super_admin')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  list(): Promise<AdminUserRow[]> {
    return this.service.list();
  }

  @Post()
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<AdminUserRow> {
    return this.service.create(dto, user.id, ip);
  }

  @Patch(':publicId')
  update(
    @Param('publicId') publicId: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<AdminUserRow> {
    return this.service.update(publicId, dto, user.id, ip);
  }

  @Delete(':publicId')
  @HttpCode(204)
  remove(
    @Param('publicId') publicId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<void> {
    return this.service.remove(publicId, user.id, ip);
  }

  @Post(':publicId/set-password')
  @HttpCode(200)
  setPassword(
    @Param('publicId') publicId: string,
    @Body() dto: SetAdminPasswordDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<void> {
    return this.service.setPassword(publicId, dto, user.id, ip);
  }
}
