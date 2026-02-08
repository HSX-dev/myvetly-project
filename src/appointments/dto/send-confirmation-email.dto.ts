import { IsString, IsUUID } from 'class-validator';

export class SendConfirmationEmailDto {
  @IsUUID()
  appointment_id: string;
}

