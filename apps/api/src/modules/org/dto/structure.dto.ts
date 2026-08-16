import { DegreeType } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateFacultyDto {
  @IsString() @Length(2, 150) name!: string;
}
export class UpdateFacultyDto {
  @IsOptional() @IsString() @Length(2, 150) name?: string;
}

export class CreateDepartmentDto {
  @IsString() facultyPublicId!: string;
  @IsString() @Length(2, 150) name!: string;
}
export class UpdateDepartmentDto {
  @IsOptional() @IsString() @Length(2, 150) name?: string;
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

export class CreateSemesterDto {
  @IsString() programPublicId!: string;
  @IsInt() @Min(1) @Max(12) number!: number;
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

/** Assign (or clear, with null) the single teacher of a course part. */
export class AssignTeacherDto {
  @IsOptional() @IsString() teacherPublicId?: string | null;
}

export class CreateBatchDto {
  @IsString() programPublicId!: string;
  @IsString() @Length(1, 60) name!: string;
  @IsInt() @Min(1950) @Max(2100) year!: number;
}
export class UpdateBatchDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) year?: number;
}

/** Assign (or clear, with null) the semester a batch currently sits in. */
export class AssignBatchSemesterDto {
  @IsOptional() @IsString() semesterPublicId?: string | null;
}

/** Move a student to a different batch. */
export class ChangeStudentBatchDto {
  @IsString() batchPublicId!: string;
}
