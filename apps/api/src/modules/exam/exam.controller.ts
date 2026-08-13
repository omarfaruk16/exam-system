import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { AddExamQuestionDto, CreateExamDto, ReviewNoteDto, UpdateExamDto } from './dto/exam.dto';
import { ExamService } from './exam.service';

@Controller('exams')
export class ExamController {
  constructor(private readonly exams: ExamService) {}

  // ── authoring (teacher) ──
  @Roles('teacher')
  @Post()
  create(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateExamDto) {
    return this.exams.createExam(u, ip, dto);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Get(':publicId')
  get(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.exams.getExam(u, id);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Get(':publicId/questions')
  questions(@CurrentUser() u: AuthUser, @Param('publicId') id: string) {
    return this.exams.getExamQuestions(u, id);
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

  @Roles('teacher')
  @Post(':publicId/questions')
  addQuestion(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: AddExamQuestionDto,
  ) {
    return this.exams.addQuestion(u, ip, id, dto);
  }

  @Roles('teacher')
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
  @Roles('teacher')
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

  @Roles('admin', 'super_admin')
  @Delete(':publicId')
  remove(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('publicId') id: string) {
    return this.exams.remove(u, ip, id);
  }
}
