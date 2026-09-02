import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateAppointmentDto,
  IsFutureDateConstraint,
} from '../../modules/appointments/dto/create-appointment.dto';
import { CreateClientDto } from '../../modules/clients/dto/create-client.dto';
import { CreateTaskDto } from '../../modules/tasks/dto/create-task.dto';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const VET_ID = '33333333-3333-4333-8333-333333333333';
const PET_ID = '44444444-4444-4444-8444-444444444444';

const failingProps = (dto: object): string[] =>
  validateSync(dto as object, { skipMissingProperties: false }).map((error) => error.property);

const inHours = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

/**
 * Regression cover for request validation on the busiest write endpoints.
 */
describe('request DTO validation', () => {
  describe('CreateAppointmentDto', () => {
    const valid = () => ({
      clinic_id: CLINIC_ID,
      appointment_time: inHours(24),
      service_type: 'consultation',
    });

    it('accepts a minimal future booking', () => {
      const dto = plainToInstance(CreateAppointmentDto, valid());
      expect(failingProps(dto)).toEqual([]);
    });

    it('accepts a fully populated booking', () => {
      const dto = plainToInstance(CreateAppointmentDto, {
        ...valid(),
        pet_id: PET_ID,
        vet_id: VET_ID,
        organization_id: ORG_ID,
        status: 'scheduled',
        estimated_duration: 45,
        emergency_level: 'high',
        is_telehealth: true,
        notes: 'bring records',
      });

      expect(failingProps(dto)).toEqual([]);
    });

    it('requires a clinic id', () => {
      const { clinic_id, ...rest } = valid();
      const dto = plainToInstance(CreateAppointmentDto, rest);

      expect(failingProps(dto)).toContain('clinic_id');
    });

    it('requires the clinic id to be a uuid', () => {
      const dto = plainToInstance(CreateAppointmentDto, { ...valid(), clinic_id: 'not-a-uuid' });
      expect(failingProps(dto)).toContain('clinic_id');
    });

    it('requires a service type', () => {
      const { service_type, ...rest } = valid();
      const dto = plainToInstance(CreateAppointmentDto, rest);

      expect(failingProps(dto)).toContain('service_type');
    });

    it('rejects an appointment time in the past', () => {
      const dto = plainToInstance(CreateAppointmentDto, {
        ...valid(),
        appointment_time: inHours(-1),
      });

      expect(failingProps(dto)).toContain('appointment_time');
    });

    it('rejects a non-date appointment time', () => {
      const dto = plainToInstance(CreateAppointmentDto, {
        ...valid(),
        appointment_time: 'tomorrow',
      });

      expect(failingProps(dto)).toContain('appointment_time');
    });

    it('rejects an unknown status', () => {
      const dto = plainToInstance(CreateAppointmentDto, { ...valid(), status: 'archived' });
      expect(failingProps(dto)).toContain('status');
    });

    it('rejects an unknown emergency level', () => {
      const dto = plainToInstance(CreateAppointmentDto, { ...valid(), emergency_level: 'urgent' });
      expect(failingProps(dto)).toContain('emergency_level');
    });

    it('rejects a non-numeric estimated duration', () => {
      const dto = plainToInstance(CreateAppointmentDto, { ...valid(), estimated_duration: '30' });
      expect(failingProps(dto)).toContain('estimated_duration');
    });

    it('tolerates an empty pet id for block bookings', () => {
      const dto = plainToInstance(CreateAppointmentDto, { ...valid(), pet_id: '', vet_id: '' });
      expect(failingProps(dto)).toEqual([]);
    });

    it('still rejects a malformed pet id', () => {
      const dto = plainToInstance(CreateAppointmentDto, { ...valid(), pet_id: 'nope' });
      expect(failingProps(dto)).toContain('pet_id');
    });
  });

  describe('IsFutureDateConstraint', () => {
    const constraint = new IsFutureDateConstraint();
    const args = {} as any;

    it('accepts a date comfortably in the future', () => {
      expect(constraint.validate(inHours(2), args)).toBe(true);
    });

    it('rejects a date in the past', () => {
      expect(constraint.validate(inHours(-2), args)).toBe(false);
    });

    it('rejects an empty value', () => {
      expect(constraint.validate('', args)).toBe(false);
    });

    it('explains itself with a stable message', () => {
      expect(constraint.defaultMessage(args)).toBe(
        'Appointment time must be in the future. Cannot create appointments in the past.',
      );
    });
  });

  describe('CreateClientDto', () => {
    const valid = () => ({ organization_id: ORG_ID, clinic_id: CLINIC_ID });

    it('accepts the minimal system fields', () => {
      expect(failingProps(plainToInstance(CreateClientDto, valid()))).toEqual([]);
    });

    it('requires an organization id', () => {
      const { organization_id, ...rest } = valid();
      expect(failingProps(plainToInstance(CreateClientDto, rest))).toContain('organization_id');
    });

    it('requires a clinic id', () => {
      const { clinic_id, ...rest } = valid();
      expect(failingProps(plainToInstance(CreateClientDto, rest))).toContain('clinic_id');
    });

    it('rejects a malformed email', () => {
      const dto = plainToInstance(CreateClientDto, { ...valid(), email: 'not-an-email' });
      expect(failingProps(dto)).toContain('email');
    });

    it('rejects a gender outside the accepted set', () => {
      const dto = plainToInstance(CreateClientDto, { ...valid(), gender: 'Other' });
      expect(failingProps(dto)).toContain('gender');
    });

    it('accepts the documented client types', () => {
      for (const client_type of ['Individual', 'Family', 'Business', 'Rescue', 'Breeder']) {
        const dto = plainToInstance(CreateClientDto, { ...valid(), client_type });
        expect(failingProps(dto)).toEqual([]);
      }
    });

    it('rejects an unknown account source', () => {
      const dto = plainToInstance(CreateClientDto, { ...valid(), account_source: 'Billboard' });
      expect(failingProps(dto)).toContain('account_source');
    });
  });

  describe('CreateTaskDto', () => {
    const valid = () => ({
      title: 'Call owner',
      due_date: inHours(24),
      assigned_to: VET_ID,
    });

    it('accepts a minimal task', () => {
      expect(failingProps(plainToInstance(CreateTaskDto, valid()))).toEqual([]);
    });

    it('requires a title', () => {
      const { title, ...rest } = valid();
      expect(failingProps(plainToInstance(CreateTaskDto, rest))).toContain('title');
    });

    it('requires a due date', () => {
      const { due_date, ...rest } = valid();
      expect(failingProps(plainToInstance(CreateTaskDto, rest))).toContain('due_date');
    });

    it('requires an assignee', () => {
      const { assigned_to, ...rest } = valid();
      expect(failingProps(plainToInstance(CreateTaskDto, rest))).toContain('assigned_to');
    });

    it('treats an empty optional client id as absent', () => {
      const dto = plainToInstance(CreateTaskDto, { ...valid(), client_id: '' });
      expect(failingProps(dto)).toEqual([]);
    });

    it('rejects an unknown priority', () => {
      const dto = plainToInstance(CreateTaskDto, { ...valid(), priority: 'urgent' });
      expect(failingProps(dto)).toContain('priority');
    });

    it('accepts the documented statuses', () => {
      for (const status of ['open', 'in_progress', 'closed']) {
        expect(failingProps(plainToInstance(CreateTaskDto, { ...valid(), status }))).toEqual([]);
      }
    });
  });
});
