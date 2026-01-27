import { Expose } from 'class-transformer';
import { IsString, IsOptional, IsEmail, IsUUID, IsBoolean, IsDateString, IsEnum } from 'class-validator';

export class CreateClientDto {
  // User fields (optional - will create user if not provided)
  @Expose()
  @IsUUID()
  @IsOptional()
  user_id?: string;

  @Expose()
  @IsString()
  @IsOptional()
  first_name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  last_name?: string;

  @Expose()
  @IsEmail()
  @IsOptional()
  email?: string;

  // Client fields
  @Expose()
  @IsString()
  @IsOptional()
  phone?: string;

  @Expose()
  @IsString()
  @IsOptional()
  title?: string;

  @Expose()
  @IsString()
  @IsOptional()
  aka?: string;

  @Expose()
  @IsEnum(['Male', 'Female', 'Non-binary', 'Prefer not to say'])
  @IsOptional()
  gender?: 'Male' | 'Female' | 'Non-binary' | 'Prefer not to say';

  @Expose()
  @IsEnum(['Individual', 'Family', 'Business', 'Rescue', 'Breeder'])
  @IsOptional()
  client_type?: 'Individual' | 'Family' | 'Business' | 'Rescue' | 'Breeder';

  @Expose()
  @IsString()
  @IsOptional()
  address_street?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address_apt?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address_city?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address_state?: string;

  @Expose()
  @IsString()
  @IsOptional()
  address_zip?: string;

  @Expose()
  @IsString()
  @IsOptional()
  drivers_license_number?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  drivers_license_expiration?: string;

  @Expose()
  @IsString()
  @IsOptional()
  alert_notes?: string; // Maps to 'alert' in database

  @Expose()
  @IsEnum(['Walk-in', 'Referral', 'Online', 'Phone', 'Social Media', 'Advertisement'])
  @IsOptional()
  account_source?: 'Walk-in' | 'Referral' | 'Online' | 'Phone' | 'Social Media' | 'Advertisement';

  @Expose()
  @IsBoolean()
  @IsOptional()
  tax_exempt?: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  additional_info?: string;

  @Expose()
  @IsEnum(['Email', 'Phone', 'SMS', 'Mail'])
  @IsOptional()
  comm_preferred_contact_method?: 'Email' | 'Phone' | 'SMS' | 'Mail';

  // Communication preferences (maps to database fields)
  @Expose()
  @IsBoolean()
  @IsOptional()
  comm_email_ok?: boolean; // Maps to 'comm_appointment_notification' in database

  @Expose()
  @IsBoolean()
  @IsOptional()
  comm_phone_ok?: boolean; // Maps to 'comm_mass_communication' in database

  @Expose()
  @IsBoolean()
  @IsOptional()
  comm_sms_ok?: boolean; // Maps to 'comm_client_reminders' in database

  @Expose()
  @IsBoolean()
  @IsOptional()
  comm_mail_ok?: boolean;

  // System fields (required)
  @Expose()
  @IsUUID()
  organization_id: string;

  @Expose()
  @IsUUID()
  clinic_id: string;
}
