import { DegreeType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

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
  @IsString() batchPublicId!: string;
  // A free-text label, e.g. "Fall 2024" or "1st Semester".
  @IsString() @Length(1, 60) name!: string;
  // Optional explicit ordinal; auto-assigned (next in the batch) when omitted.
  @IsOptional() @IsInt() @Min(1) @Max(100) number?: number;
}

export class UpdateSemesterDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
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

/** Manually create a single teacher account. */
export class CreateTeacherManualDto {
  @IsString() @Length(2, 150) displayName!: string;
  @IsEmail() email!: string;
  @IsString() departmentPublicId!: string;
  @IsOptional() @IsString() @Length(1, 100) designation?: string;
}

export class UpdateTeacherDto {
  @IsOptional() @IsString() @Length(1, 100) designation?: string;
  @IsOptional() @IsString() @Length(2, 150) displayName?: string;
}

/** Manually create a single student account. Temp password = Student@123. */
export class CreateStudentManualDto {
  @IsString() @Length(2, 30) studentId!: string;
  @IsString() @Length(2, 150) displayName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() batchPublicId!: string;
  @IsOptional() @IsString() @Length(2, 50) registrationNumber?: string;
  @IsOptional() @IsString() @Length(1, 20) rollNumber?: string;
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @Length(2, 150) displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(2, 50) registrationNumber?: string;
  @IsOptional() @IsString() @Length(1, 20) rollNumber?: string;
}
