import { DegreeType } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateFacultyDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(1, 20) code!: string;
}
export class UpdateFacultyDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 20) code?: string;
}

export class CreateDepartmentDto {
  @IsString() facultyPublicId!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(1, 20) code!: string;
}
export class UpdateDepartmentDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 20) code?: string;
}

export class CreateProgramDto {
  @IsString() departmentPublicId!: string;
  @IsString() @Length(2, 150) name!: string;
  @IsEnum(DegreeType) degreeType!: DegreeType;
  @IsInt() @Min(1) @Max(12) durationYears!: number;
}
export class UpdateProgramDto {
  @IsOptional() @IsString() @Length(2, 150) name?: string;
  @IsOptional() @IsEnum(DegreeType) degreeType?: DegreeType;
  @IsOptional() @IsInt() @Min(1) @Max(12) durationYears?: number;
}

export class CreateBatchDto {
  @IsString() programPublicId!: string;
  @IsString() @Length(1, 60) name!: string;
  @IsInt() @Min(1950) @Max(2100) admissionYear!: number;
}
export class UpdateBatchDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) admissionYear?: number;
}

export class CreateSemesterDto {
  @IsString() programPublicId!: string;
  @IsInt() @Min(1) @Max(8) number!: number;
}
export class UpdateSemesterDto {
  @IsOptional() @IsInt() @Min(1) @Max(8) number?: number;
}

export class CreateCourseDto {
  @IsString() semesterPublicId!: string;
  @IsString() @Length(2, 30) code!: string;
  @IsString() @Length(2, 150) name!: string;
  @IsNumber() @Min(0) credit!: number;
}
export class UpdateCourseDto {
  @IsOptional() @IsString() @Length(2, 30) code?: string;
  @IsOptional() @IsString() @Length(2, 150) name?: string;
  @IsOptional() @IsNumber() @Min(0) credit?: number;
}

export class CreateCoursePartDto {
  @IsString() coursePublicId!: string;
  @IsString() @Length(1, 60) name!: string;
  @IsNumber() @Min(0) marksWeight!: number;
}
export class UpdateCoursePartDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsNumber() @Min(0) marksWeight?: number;
}
