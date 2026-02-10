import { Expose } from 'class-transformer';
import { IsUUID } from 'class-validator';

export class CopyReminderDto {
  @Expose()
  @IsUUID()
  target_pet_id: string;
}
