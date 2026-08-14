import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import {
  AssignTeacherDto,
  CreateOfferingDto,
  CreateOfferingPartDto,
  CreateTermDto,
  UpdateTermDto,
} from './dto/offering.dto';
import { OfferingService } from './offering.service';

@Controller('org')
@Roles('super_admin', 'admin')
export class OfferingController {
  constructor(private readonly svc: OfferingService) {}

  private ctx(actor: AuthUser, ip: string) {
    return { actor, ip };
  }

  // Terms
  @Roles('super_admin', 'admin', 'department_head')
  @Get('terms')
  listTerms() {
    return this.svc.listTerms();
  }
  @Post('terms')
  createTerm(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateTermDto) {
    return this.svc.createTerm(this.ctx(u, ip), dto);
  }
  @Patch('terms/:publicId')
  updateTerm(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateTermDto,
  ) {
    return this.svc.updateTerm(this.ctx(u, ip), id, dto);
  }
  @Delete('terms/:publicId')
  removeTerm(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.svc.removeTerm(this.ctx(u, ip), id);
  }

  // Teachers (for the assign-teacher selector)
  @Roles('super_admin', 'admin', 'department_head')
  @Get('teachers')
  listTeachers(@CurrentUser() u: AuthUser, @Query('department') department: string) {
    return this.svc.listTeachers(u, department);
  }

  // Offerings
  @Roles('super_admin', 'admin', 'department_head')
  @Get('offerings')
  listOfferings(@CurrentUser() u: AuthUser) {
    return this.svc.listOfferings(u);
  }
  @Post('offerings')
  createOffering(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateOfferingDto) {
    return this.svc.createOffering(this.ctx(u, ip), dto);
  }
  @Delete('offerings/:publicId')
  removeOffering(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.svc.removeOffering(this.ctx(u, ip), id);
  }
  @Roles('super_admin', 'admin', 'department_head')
  @Get('offerings/:publicId/parts')
  listParts(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.svc.listOfferingParts(u, id);
  }

  // Offering parts + teacher assignment
  @Post('offering-parts')
  createOfferingPart(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateOfferingPartDto,
  ) {
    return this.svc.createOfferingPart(this.ctx(u, ip), dto);
  }
  @Roles('super_admin', 'admin', 'department_head')
  @Put('offering-parts/:publicId/teacher')
  assignTeacher(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: AssignTeacherDto,
  ) {
    return this.svc.assignTeacher(this.ctx(u, ip), id, dto);
  }
}
