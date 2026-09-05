import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import {
  AssignBatchSemesterDto,
  AssignTeacherDto,
  ChangeStudentBatchDto,
  CreateBatchDto,
  CreateCourseDto,
  CreateCoursePartDto,
  CreateDepartmentDto,
  CreateFacultyDto,
  CreateProgramDto,
  CreateSemesterDto,
  UpdateSemesterDto,
  CreateStudentManualDto,
  CreateTeacherManualDto,
  UpdateBatchDto,
  UpdateCourseDto,
  UpdateCoursePartDto,
  UpdateDepartmentDto,
  UpdateFacultyDto,
  UpdateProgramDto,
  UpdateStudentDto,
  UpdateTeacherDto,
} from './dto/structure.dto';
import { StructureService, type ExportFormat } from './structure.service';

/** Academic structure management — an administrator function. */
@Controller('org')
@Roles('super_admin', 'admin')
export class StructureController {
  constructor(private readonly svc: StructureService) {}

  private ctx(actor: AuthUser, ip: string) {
    return { actor, ip };
  }

  // Faculties
  @Roles('super_admin', 'admin', 'department_head')
  @Get('faculties')
  listFaculties(@CurrentUser() u: AuthUser) {
    return this.svc.listFaculties(u);
  }
  @Get('faculties/:publicId') getFaculty(@Param('publicId') id: string) {
    return this.svc.getFaculty(id);
  }
  @Roles('super_admin', 'admin', 'department_head')
  @Get('faculties/:publicId/stats')
  getFacultyStats(@Param('publicId') id: string) {
    return this.svc.getFacultyStats(id);
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
  @Roles('super_admin', 'admin', 'department_head')
  @Get('departments')
  listDepartments(@CurrentUser() u: AuthUser, @Query('faculty') faculty?: string) {
    return this.svc.listDepartments(u, faculty);
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
  @Roles('super_admin', 'admin', 'department_head')
  @Get('programs')
  listPrograms(@CurrentUser() u: AuthUser, @Query('department') department?: string) {
    return this.svc.listPrograms(u, department);
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
  @Roles('super_admin', 'admin', 'department_head')
  @Get('batches')
  listBatches(
    @CurrentUser() u: AuthUser,
    @Query('program') program?: string,
    @Query('department') department?: string,
  ) {
    return this.svc.listBatches(u, program, department);
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
  @Roles('super_admin', 'admin', 'department_head')
  @Get('semesters')
  listSemesters(@CurrentUser() u: AuthUser, @Query('batch') batch?: string) {
    return this.svc.listSemesters(u, batch);
  }
  @Post('semesters') createSemester(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Body() dto: CreateSemesterDto,
  ) {
    return this.svc.createSemester(this.ctx(u, ip), dto);
  }
  @Patch('semesters/:publicId') updateSemester(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateSemesterDto,
  ) {
    return this.svc.updateSemester(this.ctx(u, ip), id, dto);
  }
  @Delete('semesters/:publicId') removeSemester(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
  ) {
    return this.svc.removeSemester(this.ctx(u, ip), id);
  }

  // Courses
  @Roles('super_admin', 'admin', 'department_head')
  @Get('courses')
  listCourses(@CurrentUser() u: AuthUser, @Query('semester') semester?: string) {
    return this.svc.listCourses(u, semester);
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
  @Roles('super_admin', 'admin', 'department_head')
  @Get('course-parts')
  listCourseParts(@Query('course') course?: string) {
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

  // Assign the teacher of a part — department heads may do this within their department.
  @Roles('super_admin', 'admin', 'department_head')
  @Put('course-parts/:publicId/teacher')
  assignTeacher(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: AssignTeacherDto,
  ) {
    return this.svc.assignTeacher(this.ctx(u, ip), id, dto);
  }

  // Structure exports (xlsx). One route keeps it clear of the `:publicId` routes above.
  @Get('export/:type')
  exportStructure(
    @Res({ passthrough: true }) res: Response,
    @Param('type') type: string,
    @Query('format') format?: string,
  ): Promise<StreamableFile> {
    res.set({ 'Cache-Control': 'no-store' });
    const fmt: ExportFormat = format === 'csv' ? 'csv' : 'xlsx';
    switch (type) {
      case 'faculties':
        return this.svc.exportFaculties(fmt);
      case 'departments':
        return this.svc.exportDepartments(fmt);
      case 'semesters':
        return this.svc.exportSemesters(fmt);
      case 'courses':
        return this.svc.exportCourses(fmt);
      default:
        throw new BadRequestException('Unknown export type');
    }
  }

  // Teacher admin list and CRUD (admin only — class-level @Roles applies)
  @Roles('super_admin', 'admin', 'department_head')
  @Get('teachers/export')
  exportTeachers(
    @Res({ passthrough: true }) res: Response,
    @Query('department') department?: string,
    @Query('format') format?: string,
  ) {
    res.set({ 'Cache-Control': 'no-store' });
    return this.svc.exportTeachers(department, format === 'csv' ? 'csv' : 'xlsx');
  }

  @Roles('super_admin', 'admin', 'department_head')
  @Get('teachers')
  listTeachersAdmin(@CurrentUser() u: AuthUser, @Query('department') department?: string) {
    return this.svc.listTeachersAdmin(u, department);
  }

  @Post('teachers')
  createTeacher(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateTeacherManualDto) {
    return this.svc.createTeacherManual(this.ctx(u, ip), dto);
  }

  @Patch('teachers/:publicId')
  updateTeacher(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.svc.updateTeacher(this.ctx(u, ip), id, dto);
  }

  @Delete('teachers/:publicId')
  deleteTeacher(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.svc.deleteTeacher(this.ctx(u, ip), id);
  }

  // Teacher selector for assign-teacher dropdown — dept_head access allowed.
  @Roles('super_admin', 'admin', 'department_head')
  @Get('teachers/selector')
  listTeachersSelector(@CurrentUser() u: AuthUser, @Query('department') department: string) {
    return this.svc.listTeachers(u, department);
  }

  // A teacher's course-part assignments (their teaching load).
  @Roles('super_admin', 'admin', 'department_head')
  @Get('teachers/:publicId/assignments')
  teacherAssignments(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.svc.listTeacherAssignments(u, id);
  }

  // Assign the semester a batch currently sits in (advance it as the batch progresses).
  @Put('batches/:publicId/semester')
  assignBatchSemester(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: AssignBatchSemesterDto,
  ) {
    return this.svc.assignBatchSemester(this.ctx(u, ip), id, dto);
  }

  // Students
  @Get('students/export')
  exportStudents(
    @Query('batch') batch: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @Query('format') format?: string,
  ) {
    res.set({ 'Cache-Control': 'no-store' });
    return this.svc.exportStudents(batch, format === 'csv' ? 'csv' : 'xlsx');
  }

  @Roles('super_admin', 'admin', 'department_head')
  @Get('students')
  listStudents(@CurrentUser() u: AuthUser, @Query('batch') batch?: string) {
    return this.svc.listStudents(u, batch);
  }

  @Roles('super_admin', 'admin', 'department_head')
  @Patch('students/:publicId')
  updateStudent(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.svc.updateStudent(this.ctx(u, ip), id, dto);
  }

  @Post('students')
  createStudent(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateStudentManualDto) {
    return this.svc.createStudentManual(this.ctx(u, ip), dto);
  }

  @Delete('students/:publicId')
  deleteStudent(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.svc.deleteStudent(this.ctx(u, ip), id);
  }

  @Roles('super_admin', 'admin', 'department_head')
  @Put('students/:publicId/batch')
  changeStudentBatch(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: ChangeStudentBatchDto,
  ) {
    return this.svc.changeStudentBatch(this.ctx(u, ip), id, dto);
  }
}
