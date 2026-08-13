import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateQuestionBankDto {
  @IsString() offeringPartPublicId!: string;
  @IsString() @Length(1, 120) name!: string;
}

export class QuestionOptionInput {
  @IsString() @Length(1, 500) text!: string;
  @IsBoolean() isCorrect!: boolean;
  @IsInt() @Min(0) order!: number;
}

export class CreateQuestionDto {
  @IsString() bankPublicId!: string;
  @IsEnum(QuestionType) type!: QuestionType;
  @IsString() @Length(1, 5000) text!: string;
  @IsNumber() @Min(0) marks!: number;
  @IsOptional() @IsString() @Length(0, 5000) explanation?: string;
  @IsOptional() @IsString() @Length(0, 5000) modelAnswer?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInput)
  options?: QuestionOptionInput[];
}

export class UpdateQuestionDto {
  @IsOptional() @IsString() @Length(1, 5000) text?: string;
  @IsOptional() @IsNumber() @Min(0) marks?: number;
  @IsOptional() @IsString() @Length(0, 5000) explanation?: string;
  @IsOptional() @IsString() @Length(0, 5000) modelAnswer?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInput)
  options?: QuestionOptionInput[];
}
