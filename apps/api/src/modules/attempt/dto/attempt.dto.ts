import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class AnswerInput {
  @IsString() questionPublicId!: string;
  @IsOptional() @IsString() selectedOptionId?: string | null;
  @IsOptional() @IsString() @MaxLength(20000) writtenText?: string | null;
}

export class AutosaveDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerInput)
  answers!: AnswerInput[];
}
