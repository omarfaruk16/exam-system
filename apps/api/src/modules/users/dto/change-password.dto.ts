import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(200)
  @Matches(/[a-z]/, { message: 'Must include a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'Must include an uppercase letter' })
  @Matches(/[0-9]/, { message: 'Must include a number' })
  newPassword!: string;
}
