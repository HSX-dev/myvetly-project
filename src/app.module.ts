import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './modules/ai/ai.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { DatabaseModule } from './modules/database/database.module';
import { CacheModule } from './modules/cache/cache.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/auth.guard';
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
import { SoapModule } from './modules/soap/soap.module';
import { WhiteboardModule } from './modules/whiteboard/whiteboard.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ZoomModule } from './modules/zoom/zoom.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { GoogleModule } from './modules/google/google.module';
import { SearchModule } from './modules/search/search.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // In development, prefer .env.local (fallback to .env); in production, use .env
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env'
          : ['.env.local', '.env.development', '.env'], // Try .env.local first, then .env.development, then .env
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
    SoapModule,
    WhiteboardModule,
    OnboardingModule,
    ZoomModule,
    PaymentsModule,
    GoogleModule,
    SearchModule,
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
export class AppModule { }
