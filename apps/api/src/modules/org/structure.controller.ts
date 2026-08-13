import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import {
  CreateBatchDto,
  CreateCourseDto,
  CreateCoursePartDto,
  CreateDepartmentDto,
  CreateFacultyDto,
  CreateProgramDto,
  CreateSemesterDto,
  UpdateBatchDto,
  UpdateCourseDto,
  UpdateCoursePartDto,
  UpdateDepartmentDto,
  UpdateFacultyDto,
  UpdateProgramDto,
} from './dto/structure.dto';
import { StructureService } from './structure.service';

/** Organizational structure CRUD — an admin function (§6.2). */
@Controller('org')
@Roles('super_admin', 'admin')
export class StructureController {
  constructor(private readonly svc: StructureService) {}

  private ctx(actor: AuthUser, ip: string) {
    return { actor, ip };
  }

  // Faculties
  @Get('faculties') listFaculties() {
    return this.svc.listFaculties();
  }
  @Get('faculties/:publicId') getFaculty(@Param('publicId') id: string) {
    return this.svc.getFaculty(id);
  }
  @Post('faculties') createFaculty(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateFacultyDto,
  ) {
    return this.svc.createFaculty(this.ctx(u, ip), dto);
  }
  @Patch('faculties/:publicId') updateFaculty(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateFacultyDto,
  ) {
    return this.svc.updateFaculty(this.ctx(u, ip), id, dto);
  }
  @Delete('faculties/:publicId') removeFaculty(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeFaculty(this.ctx(u, ip), id);
  }

  // Departments
  @Get('departments') listDepartments(@Query('faculty') faculty?: string) {
    return this.svc.listDepartments(faculty);
  }
  @Get('departments/:publicId') getDepartment(@Param('publicId') id: string) {
    return this.svc.getDepartment(id);
  }
  @Post('departments') createDepartment(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.svc.createDepartment(this.ctx(u, ip), dto);
  }
  @Patch('departments/:publicId') updateDepartment(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.svc.updateDepartment(this.ctx(u, ip), id, dto);
  }
  @Delete('departments/:publicId') removeDepartment(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeDepartment(this.ctx(u, ip), id);
  }

  // Programs
  @Get('programs') listPrograms(@Query('department') department?: string) {
    return this.svc.listPrograms(department);
  }
  @Post('programs') createProgram(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateProgramDto,
  ) {
    return this.svc.createProgram(this.ctx(u, ip), dto);
  }
  @Patch('programs/:publicId') updateProgram(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.svc.updateProgram(this.ctx(u, ip), id, dto);
  }
  @Delete('programs/:publicId') removeProgram(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeProgram(this.ctx(u, ip), id);
  }

  // Batches
  @Get('batches') listBatches(@Query('program') program?: string) {
    return this.svc.listBatches(program);
  }
  @Post('batches') createBatch(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateBatchDto,
  ) {
    return this.svc.createBatch(this.ctx(u, ip), dto);
  }
  @Patch('batches/:publicId') updateBatch(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.svc.updateBatch(this.ctx(u, ip), id, dto);
  }
  @Delete('batches/:publicId') removeBatch(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeBatch(this.ctx(u, ip), id);
  }

  // Semesters
  @Get('semesters') listSemesters(@Query('program') program?: string) {
    return this.svc.listSemesters(program);
  }
  @Post('semesters') createSemester(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateSemesterDto,
  ) {
    return this.svc.createSemester(this.ctx(u, ip), dto);
  }
  @Delete('semesters/:publicId') removeSemester(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeSemester(this.ctx(u, ip), id);
  }

  // Courses
  @Get('courses') listCourses(@Query('semester') semester?: string) {
    return this.svc.listCourses(semester);
  }
  @Post('courses') createCourse(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateCourseDto,
  ) {
    return this.svc.createCourse(this.ctx(u, ip), dto);
  }
  @Patch('courses/:publicId') updateCourse(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.svc.updateCourse(this.ctx(u, ip), id, dto);
  }
  @Delete('courses/:publicId') removeCourse(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeCourse(this.ctx(u, ip), id);
  }

  // Course parts
  @Get('course-parts') listCourseParts(@Query('course') course?: string) {
    return this.svc.listCourseParts(course);
  }
  @Post('course-parts') createCoursePart(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateCoursePartDto,
  ) {
    return this.svc.createCoursePart(this.ctx(u, ip), dto);
  }
  @Patch('course-parts/:publicId') updateCoursePart(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateCoursePartDto,
  ) {
    return this.svc.updateCoursePart(this.ctx(u, ip), id, dto);
  }
  @Delete('course-parts/:publicId') removeCoursePart(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeCoursePart(this.ctx(u, ip), id);
  }
}
