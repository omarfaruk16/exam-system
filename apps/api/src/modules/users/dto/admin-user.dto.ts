import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @IsString() @MinLength(2) username!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsEmail() @IsOptional() email?: string;
  @IsIn(['admin', 'department_head']) role!: 'admin' | 'department_head';
  @IsString() @IsOptional() scopeFacultyPublicId?: string;
  @IsString() @IsOptional() scopeDepartmentPublicId?: string;
}

export class UpdateAdminUserDto {
  @IsString() @MinLength(2) @IsOptional() displayName?: string;
  @IsEmail() @IsOptional() email?: string;
}

export class SetAdminPasswordDto {
  @IsString() @MinLength(8) password!: string;
}
