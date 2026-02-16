import { Expose } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @Expose()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  new_password: string;
}

