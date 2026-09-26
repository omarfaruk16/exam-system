import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  // A small resized image data URL, or null to remove the current avatar.
  @IsOptional()
  @IsString()
  @MaxLength(700_000)
  @Matches(/^data:image\/(png|jpeg|webp);base64,/, { message: 'Unsupported image' })
  avatarUrl?: string | null;
}
