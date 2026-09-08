import { IsEmail, MaxLength } from 'class-validator';

export class UpdateEmailDto {
  @IsEmail()
  @MaxLength(200)
  newEmail!: string;
}
