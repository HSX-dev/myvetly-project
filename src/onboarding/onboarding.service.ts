import { Injectable, InternalServerErrorException, BadRequestException, HttpException } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { ClinicsService } from '../clinics/clinics.service';
import { UsersService } from '../users/users.service';
import { OnboardClientDto } from './dto/onboard-client.dto';
import { CreateOrganizationDto } from '../organizations/dto/create-organization.dto';
import { CreateClinicDto } from '../clinics/dto/create-clinic.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Injectable()
export class OnboardingService {
  constructor(
    private organizationsService: OrganizationsService,
    private clinicsService: ClinicsService,
    private usersService: UsersService,
  ) { }

  /**
   * Onboard a new client by creating:
   * 1. Organization
   * 2. Clinic
   * 3. Admin user
   * 
   * This replaces the Edge Function approach
   */
  async onboardClient(onboardDto: OnboardClientDto) {
    // Debug: Log the received DTO
    console.log('Received onboardDto:', JSON.stringify(onboardDto, null, 2));
    console.log('Type of onboardDto:', typeof onboardDto);
    console.log('Type of organizationData:', typeof onboardDto?.organizationData);

    // Early validation - check if onboardDto is valid
    if (!onboardDto) {
      throw new BadRequestException('Request body is required.');
    }

    const organizationData = onboardDto?.organizationData;
    const clinicAdminData = onboardDto?.clinicAdminData;
    console.log('Extracted organizationData:', JSON.stringify(organizationData, null, 2));
    // Validate that organizationData exists and is not empty
    if (!organizationData) {
      throw new BadRequestException(
        'Organization data is required. Please complete Step 1: Create Organization.',
      );
    }

    if (typeof organizationData !== 'object' || Object.keys(organizationData).length === 0) {
      throw new BadRequestException(
        'Organization data is required. Please complete Step 1: Create Organization.',
      );
    }

    // Validate required organization fields
    if (!organizationData?.organization_name) {
      throw new BadRequestException('Organization name is required.');
    }
    // plan_id is optional - not stored in organizations table
    if (!organizationData?.contact_name) {
      throw new BadRequestException('Contact name is required.');
    }
    if (!organizationData?.contact_email) {
      throw new BadRequestException('Contact email is required.');
    }
    if (!organizationData?.phone) {
      throw new BadRequestException('Phone number is required.');
    }

    // Validate clinicAdminData
    if (!clinicAdminData) {
      throw new BadRequestException(
        'Clinic and admin data is required. Please complete Step 2: Create Clinic & Admin.',
      );
    }

    if (typeof clinicAdminData !== 'object' || Object.keys(clinicAdminData).length === 0) {
      throw new BadRequestException(
        'Clinic and admin data is required. Please complete Step 2: Create Clinic & Admin.',
      );
    }

    // Validate required clinic/admin fields
    if (!clinicAdminData?.clinic_name) {
      throw new BadRequestException('Clinic name is required.');
    }
    if (!clinicAdminData?.address) {
      throw new BadRequestException('Clinic address is required.');
    }
    if (!clinicAdminData?.phone) {
      throw new BadRequestException('Clinic phone number is required.');
    }
    if (!clinicAdminData?.admin_full_name) {
      throw new BadRequestException('Administrator full name is required.');
    }
    if (!clinicAdminData?.admin_email) {
      throw new BadRequestException('Administrator email is required.');
    }
    if (!clinicAdminData?.admin_role) {
      throw new BadRequestException('Administrator role is required.');
    }

    try {
      // Step 1: Create Organization
      // Defensive check - ensure organizationData is still defined
      if (!organizationData) {
        throw new BadRequestException('Organization data is missing.');
      }

      const organizationDto: CreateOrganizationDto = {
        name: organizationData.organization_name,
        // plan_id is not a column in organizations table, so we don't include it
        contact_name: organizationData.contact_name,
        contact_email: organizationData.contact_email,
        phone: organizationData.phone,
        status: 'active',
      };

      const organization = await this.organizationsService.create(organizationDto);
      console.log('✅ Organization created:', organization.id);

      // Step 2: Create Clinic
      // Defensive check - ensure clinicAdminData is still defined
      if (!clinicAdminData) {
        throw new BadRequestException('Clinic and admin data is missing.');
      }

      const clinicDto: CreateClinicDto = {
        name: clinicAdminData.clinic_name,
        organization_id: organization.id,
        address: clinicAdminData.address,
        phone: clinicAdminData.phone,
        // status is not a column in clinics table, so we don't include it
      };

      const clinic = await this.clinicsService.create(clinicDto);
      console.log('✅ Clinic created:', clinic.id);

      // Step 3: Create Admin User
      // Split full name into first and last name
      const nameParts = (clinicAdminData.admin_full_name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const userDto: CreateUserDto = {
        email: clinicAdminData.admin_email,
        first_name: firstName,
        last_name: lastName,
        full_name: clinicAdminData.admin_full_name,
        role: clinicAdminData.admin_role,
        organization_id: organization.id,
        clinic_id: clinic.id,
        status: 'active',
        inviteOnly: true, // Send invitation email instead of setting password
      };

      // Create a system admin context for onboarding (bypasses RLS)
      const systemAdminContext = {
        id: 'system',
        user_id: 'system',
        auth_user_id: 'system',
        role: 'super_admin' as const,
        organization_id: null,
        clinic_id: null,
      };

      const user = await this.usersService.create(userDto, systemAdminContext);
      console.log('✅ Admin user created:', user.id);

      return {
        success: true,
        message: 'Client onboarded successfully',
        data: {
          organization: {
            id: organization.id,
            name: organization.name,
          },
          clinic: {
            id: clinic.id,
            name: clinic.name,
          },
          admin: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        },
      };
    } catch (error) {
      console.error('❌ Error onboarding client:', error);

      // If it's already an HttpException (like BadRequestException), re-throw it as-is
      if (error instanceof HttpException) {
        throw error;
      }

      // Check if it's a TypeError about undefined properties - this is a validation error
      if (error instanceof TypeError) {
        const errorMessage = error.message || '';
        if (errorMessage.includes('Cannot read properties of undefined') ||
          errorMessage.includes('Cannot read property')) {
          throw new BadRequestException(
            `Invalid request data: ${errorMessage}. Please ensure all required fields are provided.`,
          );
        }
      }

      // Only wrap unexpected errors as InternalServerErrorException
      throw new InternalServerErrorException(
        `Failed to onboard client: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

