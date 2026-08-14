import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExamSettingsDto {
  @IsBoolean() showMarksAfterSubmit!: boolean;
  @IsBoolean() showExplanation!: boolean;
  @IsBoolean() shuffleQuestions!: boolean;
  @IsBoolean() shuffleOptions!: boolean;
  @IsBoolean() negativeMarking!: boolean;
  @IsNumber() @Min(0) negativeMarkValue!: number;
}

export class CreateExamDto {
  @IsString() offeringPartPublicId!: string;
  @IsString() @Length(2, 200) title!: string;
  @IsOptional() @IsString() @Length(0, 5000) instructions?: string;
  @IsISO8601() startAt!: string;
  @IsISO8601() endAt!: string;
  @IsInt() @Min(1) durationMinutes!: number;
  @ValidateNested() @Type(() => ExamSettingsDto) settings!: ExamSettingsDto;
}

export class UpdateExamDto {
  @IsOptional() @IsString() @Length(2, 200) title?: string;
  @IsOptional() @IsString() @Length(0, 5000) instructions?: string;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() endAt?: string;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
  @IsOptional() @ValidateNested() @Type(() => ExamSettingsDto) settings?: ExamSettingsDto;
}

export class AddExamQuestionDto {
  @IsString() questionPublicId!: string;
  @IsInt() @Min(0) order!: number;
  @IsOptional() @IsNumber() @Min(0) marksOverride?: number;
}

export class ReorderQuestionsDto {
  @IsArray() @IsString({ each: true }) order!: string[];
}

export class ReviewNoteDto {
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
