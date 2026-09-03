import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import {
  AddExamQuestionDto,
  CreateExamDto,
  ReorderQuestionsDto,
  ReviewNoteDto,
  UpdateExamDto,
} from './dto/exam.dto';
import { ExamService } from './exam.service';

@Controller('exams')
export class ExamController {
  constructor(private readonly exams: ExamService) {}

  // ── authoring (teacher) ──
  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query('department') dept?: string) {
    return this.exams.listExams(u, dept);
  }

  // Two-segment path so it is never captured by the `:publicId` route below.
  @Roles('teacher')
  @Get('my/parts')
  myParts(@CurrentUser() u: AuthUser) {
    return this.exams.listMyParts(u);
  }

  // Parts the current user may author into (teacher: assigned; admin/head: in scope).
  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get('authorable/parts')
  authorableParts(@CurrentUser() u: AuthUser) {
    return this.exams.listAuthorableParts(u);
  }

  // Conducted exams for the Results portal, tagged with the batch that sat each one.
  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get('my/conducted-results')
  conductedResults(@CurrentUser() u: AuthUser) {
    return this.exams.getMyConductedExams(u);
  }

  // Marks matrix for a course part (all exams × all students + aggregates).
  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get('parts/:partPublicId/marks-matrix')
  partMarksMatrix(@CurrentUser() u: AuthUser, @Param('partPublicId') partPublicId: string) {
    return this.exams.getPartMarksMatrix(u, partPublicId);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Post()
  create(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateExamDto) {
    return this.exams.createExam(u, ip, dto);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get(':publicId')
  get(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.exams.getExam(u, id);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get(':publicId/questions')
  questions(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.exams.getExamQuestions(u, id);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get(':publicId/roster')
  roster(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.exams.getRoster(u, id);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get(':publicId/results')
  resultsOverview(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.exams.getResultsOverview(u, id);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Patch(':publicId')
  update(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateExamDto,
  ) {
    return this.exams.updateExam(u, ip, id, dto);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Post(':publicId/questions')
  addQuestion(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: AddExamQuestionDto,
  ) {
    return this.exams.addQuestion(u, ip, id, dto);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Patch(':publicId/questions/reorder')
  reorderQuestions(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: ReorderQuestionsDto,
  ) {
    return this.exams.reorderQuestions(u, ip, id, dto.order);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Delete(':publicId/questions/:examQuestionPublicId')
  removeQuestion(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Param('examQuestionPublicId') eqId: string,
  ) {
    return this.exams.removeQuestion(u, ip, id, eqId);
  }

  // ── lifecycle: teacher-driven ──
  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Post(':publicId/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.submit(u, ip, id);
  }

  @Roles('teacher')
  @Post(':publicId/revise')
  @HttpCode(200)
  revise(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.revertToDraft(u, ip, id);
  }

  // ── lifecycle: admin-driven ──
  @Roles('admin', 'super_admin')
  @Post(':publicId/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.approve(u, ip, id);
  }

  @Roles('admin', 'super_admin')
  @Post(':publicId/request-changes')
  @HttpCode(200)
  requestChanges(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: ReviewNoteDto,
  ) {
    return this.exams.requestChanges(u, ip, id, dto.note);
  }

  @Roles('admin', 'super_admin')
  @Post(':publicId/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: ReviewNoteDto,
  ) {
    return this.exams.reject(u, ip, id, dto.note);
  }

  @Roles('admin', 'super_admin')
  @Post(':publicId/publish')
  @HttpCode(200)
  publish(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.publish(u, ip, id);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Delete(':publicId')
  remove(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.remove(u, ip, id);
  }

  @Roles('admin', 'super_admin')
  @Post(':publicId/start-grading')
  @HttpCode(200)
  startGrading(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.startGrading(u, ip, id);
  }

  @Roles('admin', 'super_admin')
  @Post(':publicId/publish-results')
  @HttpCode(200)
  publishResults(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.publishResults(u, ip, id);
  }

  @Roles('admin', 'super_admin')
  @Post(':publicId/archive')
  @HttpCode(200)
  archive(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.archive(u, ip, id);
  }
}
