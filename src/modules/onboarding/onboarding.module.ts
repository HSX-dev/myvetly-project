import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [OrganizationsModule, ClinicsModule, UsersModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}

