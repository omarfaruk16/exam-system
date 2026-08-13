import { IsBoolean, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class CreateTermDto {
  @IsString() @Length(2, 60) name!: string;
  @IsISO8601() startDate!: string;
  @IsISO8601() endDate!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateTermDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateOfferingDto {
  @IsString() coursePublicId!: string;
  @IsString() batchPublicId!: string;
  @IsString() termPublicId!: string;
}

export class CreateOfferingPartDto {
  @IsString() offeringPublicId!: string;
  @IsString() coursePartPublicId!: string;
  @IsOptional() @IsString() assignedTeacherPublicId?: string;
}

export class AssignTeacherDto {
  /** Teacher publicId to assign, or null to unassign. */
  @IsOptional() @IsString() teacherPublicId?: string | null;
}
