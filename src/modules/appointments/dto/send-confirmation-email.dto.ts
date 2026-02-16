import { IsUUID } from 'class-validator';
import { Expose } from 'class-transformer';

export class SendConfirmationEmailDto {
  @Expose()
  @IsUUID()
  appointment_id: string;
}





