import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ImportJobState } from '@exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import type { UploadedExcel } from '../import/import.types';
import { CreateQuestionBankDto, CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { QuestionImportService } from './question-import.service';
import { QuestionService } from './question.service';

@Controller()
export class QuestionController {
  constructor(
    private readonly questions: QuestionService,
    private readonly imports: QuestionImportService,
  ) {}

  @Roles('teacher')
  @Post('question-banks')
  createBank(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateQuestionBankDto) {
    return this.questions.createBank(u, ip, dto);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Get('question-banks')
  listBanks(@CurrentUser() u: AuthUser, @Query('part') part: string) {
    return this.questions.listBanks(u, part);
  }

  @Roles('admin', 'super_admin', 'department_head')
  @Get('question-banks/by-department')
  listBanksByDepartment(@Query('dept') dept: string) {
    return this.questions.listBanksByDepartment(dept);
  }

  @Roles('teacher')
  @Post('questions')
  createQuestion(@CurrentUser() u: AuthUser, @Ip() ip: string, @Body() dto: CreateQuestionDto) {
    return this.questions.createQuestion(u, ip, dto);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Get('questions')
  listQuestions(
    @CurrentUser() u: AuthUser,
    @Query('bank') bank?: string,
    @Query('part') part?: string,
  ) {
    if (part) return this.questions.listQuestionsByPart(u, part);
    if (bank) return this.questions.listQuestions(u, bank);
    throw new BadRequestException('Either bank or part query param is required');
  }

  @Roles('teacher')
  @Patch('questions/:publicId')
  updateQuestion(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('publicId') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questions.updateQuestion(u, ip, id, dto);
  }

  @Roles('teacher')
  @Post('questions/import')
  @UseInterceptors(FileInterceptor('file'))
  async importQuestions(
    @CurrentUser() u: AuthUser,
    @Query('bank') bankPublicId: string,
    @UploadedFile() file: UploadedExcel | undefined,
  ): Promise<{ jobId: string }> {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    if (!bankPublicId) throw new BadRequestException('A "bank" query parameter is required');
    const bankId = await this.questions.requireAuthorableBank(u, bankPublicId);
    const jobId = await this.imports.enqueue({
      filePath: file.path,
      originalName: file.originalname,
      bankId,
      uploadedByUserId: u.id,
    });
    return { jobId };
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Get('questions/import/:jobId')
  importStatus(@Param('jobId') jobId: string): Promise<ImportJobState> {
    return this.imports.getJobState(jobId);
  }
}
