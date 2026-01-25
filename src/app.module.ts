import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { SupabaseModule } from './supabase/supabase.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ClinicsModule } from './clinics/clinics.module';
import { ClientsModule } from './clients/clients.module';
import { PetsModule } from './pets/pets.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LabsModule } from './labs/labs.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { VaccinationsModule } from './vaccinations/vaccinations.module';
import { RemindersModule } from './reminders/reminders.module';
import { TasksModule } from './tasks/tasks.module';
import { TelehealthModule } from './telehealth/telehealth.module';
import { FilesModule } from './files/files.module';
import { CommunicationModule } from './communication/communication.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // In development, prefer .env.local (fallback to .env); in production, use .env
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env'
          : ['.env.local', '.env'], // Try .env.local first, then .env
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    SupabaseModule,
    DatabaseModule,
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
  providers: [
    AppService,
    // Global authentication guard - protects all endpoints
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
