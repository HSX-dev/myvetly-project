import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';

@Injectable()
export class PrescriptionsService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select('*, pets(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select('*, pets(*)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundException(`Prescription with id ${id} not found`);
    return data;
  }

  async findByPet(petId: string, user: UserContext) {
    // First, get the pet to find its species
    const { data: petData, error: petError } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('species, clinic_id')
      .eq('id', petId)
      .single();

    if (petError) {
      throw new NotFoundException(`Pet with id ${petId} not found`);
    }

    if (!petData) {
      return [];
    }

    // Validate clinic access
    if (petData.clinic_id && user.clinic_id !== petData.clinic_id && user.role !== 'super_admin') {
      throw new NotFoundException('Pet not found');
    }

    // Get species_id from pet_species table
    const { data: speciesData } = await this.supabaseService
      .getClient()
      .from('pet_species')
      .select('id')
      .eq('name', petData.species)
      .eq('is_active', true)
      .single();

    const speciesId = speciesData?.id;

    // Get all medications for this species
    const medicationsMap = new Map<string, string>();
    if (speciesId) {
      const { data: medicationsData } = await this.supabaseService
        .getClient()
        .from('medications')
        .select('id, name')
        .eq('species_id', speciesId)
        .eq('is_active', true);

      if (medicationsData) {
        medicationsData.forEach(med => {
          medicationsMap.set(med.name.toLowerCase(), med.name);
        });
      }
    }

    // Get prescriptions with joins
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select(`
        id,
        created_at,
        updated_at,
        chronic,
        type,
        qty_dispensed,
        no_refills,
        valid_thru,
        expiration,
        directions,
        status,
        pet_id,
        service_id,
        clinic_services (
          service_name,
          invoice_line_name
        ),
        prescribed_by_user:users!prescribed_by (
          id,
          full_name
        )
      `)
      .eq('pet_id', petId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return [];
    }

    // Transform data to match frontend Prescription interface
    return data.map((prescription: any) => {
      // Determine type based on chronic field and type field
      let type: 'Chronic' | 'Acute' | 'Preventive' | 'Other' = 'Other';
      if (prescription.chronic) {
        type = 'Chronic';
      } else if (prescription.type) {
        type = prescription.type as 'Chronic' | 'Acute' | 'Preventive' | 'Other';
      }

      // Get medication name - prefer from medications catalog if available
      let rx_name = prescription.clinic_services?.invoice_line_name || 
                    prescription.clinic_services?.service_name || 
                    'Unknown Medication';
      
      // Try to match with medications catalog (case-insensitive)
      if (rx_name && rx_name !== 'Unknown Medication') {
        const matchedMed = medicationsMap.get(rx_name.toLowerCase());
        if (matchedMed) {
          rx_name = matchedMed; // Use the canonical name from medications catalog
        }
      }

      // Get prescriber name
      const prescribed_by = prescription.prescribed_by_user?.full_name || 'Unknown';

      // Map status - ensure it's one of the allowed values
      let status: 'Active' | 'Canceled' | 'Expired' = 'Active';
      if (prescription.status) {
        const statusLower = prescription.status.toLowerCase();
        if (statusLower === 'canceled') status = 'Canceled';
        else if (statusLower === 'expired') status = 'Expired';
        else status = 'Active';
      }

      // Check if expired based on valid_thru or expiration date
      if (status === 'Active') {
        const expiryDate = prescription.valid_thru || prescription.expiration;
        if (expiryDate) {
          const expiry = new Date(expiryDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (expiry < today) {
            status = 'Expired';
          }
        }
      }

      return {
        id: prescription.id,
        rx_name,
        quantity: prescription.qty_dispensed || 0,
        type,
        created_at: prescription.created_at,
        valid_through: prescription.valid_thru || prescription.expiration || prescription.created_at,
        refill_count: prescription.no_refills || 0,
        last_refill: undefined,
        directions: prescription.directions || '',
        prescribed_by,
        status,
        pet_id: prescription.pet_id,
        prescriber: prescription.prescribed_by_user ? {
          id: prescription.prescribed_by_user.id,
          full_name: prescription.prescribed_by_user.full_name,
        } : undefined,
      };
    });
  }

  async findBySoapId(soapId: string, user: UserContext) {
    // First, get the SOAP note to validate access
    const { data: soapNote, error: soapError } = await this.supabaseService
      .getClient()
      .from('soap_notes')
      .select('id, appointment_id, pet_id')
      .eq('id', soapId)
      .single();

    if (soapError || !soapNote) {
      throw new Error(`SOAP note with id ${soapId} not found`);
    }

    // Get appointment to check clinic access
    const { data: appointment, error: appointmentError } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('tenant_id')
      .eq('id', soapNote.appointment_id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found for SOAP note ${soapId}`);
    }

    // Validate clinic access
    if (appointment.tenant_id && user.clinic_id !== appointment.tenant_id) {
      throw new Error('Access denied: You do not have access to this SOAP note');
    }

    // Get prescriptions
    const { data, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .select(`
        *,
        product_service:clinic_services!service_id(id, price, price_setting, service_name, details),
        prescribed_doc:users!prescribed_by(id, full_name)
      `)
      .eq('soap_id', soapId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getMedicationsBySpecies(speciesName: string) {
    // Get species_id from pet_species table
    const { data: speciesData, error: speciesError } = await this.supabaseService
      .getClient()
      .from('pet_species')
      .select('id')
      .eq('name', speciesName)
      .eq('is_active', true)
      .single();

    if (speciesError || !speciesData) {
      return [];
    }

    // Get medications for this species
    const { data, error } = await this.supabaseService
      .getClient()
      .from('medications')
      .select('id, name, species_id')
      .eq('species_id', speciesData.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async createPrescription(createDto: any, user: UserContext) {
    // If medication_id is provided, get the medication name from medications table
    let medicationName = createDto.medication_name;
    let serviceId = createDto.service_id;

    if (createDto.medication_id && !serviceId) {
      const { data: medicationData } = await this.supabaseService
        .getClient()
        .from('medications')
        .select('name')
        .eq('id', createDto.medication_id)
        .single();

      if (medicationData) {
        medicationName = medicationData.name;
        // Try to find matching clinic_service by medication name
        if (createDto.clinic_id && medicationName) {
          const { data: serviceData } = await this.supabaseService
            .getClient()
            .from('clinic_services')
            .select('id')
            .eq('clinic_id', createDto.clinic_id)
            .or(`service_name.ilike.%${medicationName}%,invoice_line_name.ilike.%${medicationName}%`)
            .eq('type', 'Medication')
            .limit(1)
            .single();

          if (serviceData) {
            serviceId = serviceData.id;
          }
        }
      }
    }

    const { data: prescription, error } = await this.supabaseService
      .getClient()
      .from('prescriptions')
      .insert([{
        pet_id: createDto.pet_id,
        clinic_id: createDto.clinic_id || user.clinic_id,
        service_id: serviceId,
        prescribed_by: createDto.prescribed_by || user.user_id,
        chronic: createDto.chronic || false,
        type: createDto.type || 'Other',
        qty_dispensed: createDto.qty_dispensed || 0,
        no_refills: createDto.no_refills || 0,
        valid_thru: createDto.valid_thru,
        expiration: createDto.expiration,
        directions: createDto.directions,
        appointment_id: createDto.appointment_id,
        soap_id: createDto.soap_id,
        status: 'Active',
      }])
      .select(`
        *,
        clinic_services (
          service_name,
          invoice_line_name
        ),
        prescribed_by_user:users!prescribed_by (
          id,
          full_name
        )
      `)
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create prescription: ${error.message}`);
    }

    // Get pet species to match with medications catalog
    const { data: petData } = await this.supabaseService
      .getClient()
      .from('pets')
      .select('species')
      .eq('id', createDto.pet_id)
      .single();

    let rx_name = prescription.clinic_services?.invoice_line_name || 
                  prescription.clinic_services?.service_name || 
                  medicationName || 
                  'Unknown Medication';

    // Match with medications catalog if available
    if (petData?.species) {
      const { data: speciesData } = await this.supabaseService
        .getClient()
        .from('pet_species')
        .select('id')
        .eq('name', petData.species)
        .single();

      if (speciesData) {
        const { data: medData } = await this.supabaseService
          .getClient()
          .from('medications')
          .select('name')
          .eq('species_id', speciesData.id)
          .ilike('name', rx_name)
          .single();

        if (medData) {
          rx_name = medData.name;
        }
      }
    }

    let type: 'Chronic' | 'Acute' | 'Preventive' | 'Other' = 'Other';
    if (prescription.chronic) {
      type = 'Chronic';
    } else if (prescription.type) {
      type = prescription.type as any;
    }

    return {
      id: prescription.id,
      rx_name,
      quantity: prescription.qty_dispensed || 0,
      type,
      created_at: prescription.created_at,
      valid_through: prescription.valid_thru || prescription.expiration || prescription.created_at,
      refill_count: prescription.no_refills || 0,
      directions: prescription.directions || '',
      prescribed_by: prescription.prescribed_by_user?.full_name || 'Unknown',
      status: 'Active',
      pet_id: prescription.pet_id,
      prescriber: prescription.prescribed_by_user ? {
        id: prescription.prescribed_by_user.id,
        full_name: prescription.prescribed_by_user.full_name,
      } : undefined,
    };
  }
}

