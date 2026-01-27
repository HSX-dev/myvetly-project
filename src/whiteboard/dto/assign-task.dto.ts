import { IsString, IsOptional, IsEnum } from 'class-validator';

export class AssignTaskDto {
  @IsEnum(['vitals', 'walk', 'feeding', 'recheck', 'medication', 'other'])
  task_type: 'vitals' | 'walk' | 'feeding' | 'recheck' | 'medication' | 'other';

  @IsString()
  scheduled_time: string;

  @IsOptional()
  @IsString()
  assigned_to_user_id?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

