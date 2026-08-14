import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class GradeAnswerDto {
  @IsNumber() @Min(0) manualScore!: number;
  @IsOptional() @IsString() @MaxLength(5000) feedback?: string;
}
