import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';

// Infrastructure
import { SupabaseModule } from './infrastructure/supabase/supabase.module';
import { CacheModule } from './infrastructure/cache/cache.module';

// Feature Modules
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { ClientsModule } from './modules/clients/clients.module';
import { PetsModule } from './modules/pets/pets.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { LabsModule } from './modules/labs/labs.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { VaccinationsModule } from './modules/vaccinations/vaccinations.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TelehealthModule } from './modules/telehealth/telehealth.module';
import { FilesModule } from './modules/files/files.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    SupabaseModule,
    CacheModule,
    AuthModule,
    AiModule,
    UsersModule,
    OrganizationsModule,
    ClinicsModule,
    ClientsModule,
    PetsModule,
    AppointmentsModule,
    InvoicesModule,
    LabsModule,
    PrescriptionsModule,
    VaccinationsModule,
    RemindersModule,
    TasksModule,
    TelehealthModule,
    FilesModule,
    CommunicationModule,
    ReportsModule,
    RolesModule,
    SettingsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
