import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class TwoFactorLoginDto {
  @IsString() @MinLength(1) @MaxLength(128) partialToken!: string;
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' }) code!: string;
}

export class TwoFactorConfirmDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' }) code!: string;
}
