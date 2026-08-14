import { IsIn, IsOptional, IsString } from 'class-validator';

export class RequestReportDto {
  @IsString() examPublicId!: string;
  @IsIn(['overall', 'individual']) type!: 'overall' | 'individual';
  @IsOptional() @IsString() studentPublicId?: string;
}
