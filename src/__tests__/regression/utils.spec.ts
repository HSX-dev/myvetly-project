import { cleanObject, getArrayFromEnum, groupByFunc } from '../../utils/func.ref';
import cleanValue, {
  recursivelyStripNullValues,
} from '../../utils/interceptors/recursively-clean-values';
import { CleanDtoPipe } from '../../utils/pipes/clean-dto.pipe';
import { AppointmentStatus, AppointmentType, UserRole } from '../../utils/enums';

/**
 * Regression cover for the small shared helpers that every controller and
 * interceptor in the API leans on.
 */
describe('shared utilities', () => {
  describe('cleanObject', () => {
    it('drops null, undefined and empty-string members', () => {
      expect(
        cleanObject({ a: 'keep', b: null, c: undefined, d: '' }),
      ).toEqual({ a: 'keep' });
    });

    it('keeps falsy values that are not null or empty strings', () => {
      expect(cleanObject({ zero: 0, no: false, empty: [] })).toEqual({
        zero: 0,
        no: false,
        empty: [],
      });
    });

    it('returns an empty object when every member is blank', () => {
      expect(cleanObject({ a: null, b: '' })).toEqual({});
    });

    it('does not mutate the source object', () => {
      const source = { a: 'keep', b: null };
      cleanObject(source);
      expect(source).toEqual({ a: 'keep', b: null });
    });

    it('leaves nested blank members alone', () => {
      expect(cleanObject({ nested: { b: null } })).toEqual({ nested: { b: null } });
    });
  });

  describe('getArrayFromEnum', () => {
    it('returns every user role value', () => {
      expect(getArrayFromEnum(UserRole)).toEqual([
        'system_admin',
        'org_admin',
        'clinic_admin',
        'veterinarian',
        'vet_tech',
        'receptionist',
        'client',
      ]);
    });

    it('returns every appointment status value', () => {
      expect(getArrayFromEnum(AppointmentStatus)).toContain('scheduled');
      expect(getArrayFromEnum(AppointmentStatus)).toHaveLength(7);
    });

    it('returns an empty array for an empty enum-like object', () => {
      expect(getArrayFromEnum({})).toEqual([]);
    });
  });

  describe('groupByFunc', () => {
    it('groups items by the callback result', () => {
      const rows = [
        { id: 1, status: 'scheduled' },
        { id: 2, status: 'completed' },
        { id: 3, status: 'scheduled' },
      ];

      const grouped = groupByFunc(rows, (row: { status: string }) => row.status);

      expect(Object.keys(grouped).sort()).toEqual(['completed', 'scheduled']);
      expect(grouped.scheduled).toHaveLength(2);
      expect(grouped.completed).toHaveLength(1);
    });

    it('preserves the original order inside each group', () => {
      const grouped = groupByFunc([1, 3, 2, 4], (n: number) => (n % 2 === 0 ? 'even' : 'odd'));
      expect(grouped.odd).toEqual([1, 3]);
      expect(grouped.even).toEqual([2, 4]);
    });

    it('returns an empty object for an empty list', () => {
      expect(groupByFunc([], (x: unknown) => String(x))).toEqual({});
    });
  });

  describe('recursivelyStripNullValues', () => {
    it('returns primitives unchanged', () => {
      expect(recursivelyStripNullValues('text')).toBe('text');
      expect(recursivelyStripNullValues(0)).toBe(0);
      expect(recursivelyStripNullValues(false)).toBe(false);
    });

    it('turns a bare null into undefined', () => {
      expect(recursivelyStripNullValues(null)).toBeUndefined();
    });

    it('replaces null members of an object with undefined', () => {
      const result = recursivelyStripNullValues({ a: 1, b: null }) as Record<string, unknown>;

      expect(result.a).toBe(1);
      expect(result.b).toBeUndefined();
    });

    it('walks nested objects and arrays', () => {
      const result = recursivelyStripNullValues({
        pet: { name: 'Rex', breed: null },
        visits: [{ id: 1, notes: null }],
      }) as any;

      expect(result.pet.name).toBe('Rex');
      expect(result.pet.breed).toBeUndefined();
      expect(result.visits[0].id).toBe(1);
      expect(result.visits[0].notes).toBeUndefined();
    });

    it('maps null array members to undefined without changing the length', () => {
      const result = recursivelyStripNullValues([1, null, 3]) as unknown[];

      expect(result).toHaveLength(3);
      expect(result[1]).toBeUndefined();
    });
  });

  describe('cleanValue', () => {
    it('preserves a bare null so it serialises as JSON null', () => {
      expect(cleanValue(null)).toBeNull();
    });

    it('blanks out a password field', () => {
      const result = cleanValue({ email: 'a@b.c', password: 'hunter2' }) as Record<string, unknown>;

      expect(result.email).toBe('a@b.c');
      expect(result.password).toBeUndefined();
    });

    it('blanks out nested password fields', () => {
      const result = cleanValue({ user: { password: 'hunter2', id: 'u1' } }) as any;

      expect(result.user.password).toBeUndefined();
      expect(result.user.id).toBe('u1');
    });

    it('blanks null and undefined members', () => {
      const result = cleanValue({ a: 1, b: null, c: undefined }) as Record<string, unknown>;

      expect(result.a).toBe(1);
      expect(result.b).toBeUndefined();
      expect(result.c).toBeUndefined();
    });

    it('cleans every member of an array', () => {
      const result = cleanValue([{ password: 'x', id: 1 }]) as any[];

      expect(result[0].password).toBeUndefined();
      expect(result[0].id).toBe(1);
    });

    it('returns primitives unchanged', () => {
      expect(cleanValue('text')).toBe('text');
      expect(cleanValue(7)).toBe(7);
    });
  });

  describe('CleanDtoPipe', () => {
    it('strips blank members from an incoming payload', () => {
      const pipe = new CleanDtoPipe();

      expect(pipe.transform({ name: 'Rex', notes: '', vet_id: null })).toEqual({ name: 'Rex' });
    });

    it('keeps numeric zero and boolean false', () => {
      const pipe = new CleanDtoPipe();

      expect(pipe.transform({ estimated_duration: 0, is_telehealth: false })).toEqual({
        estimated_duration: 0,
        is_telehealth: false,
      });
    });
  });

  describe('domain enums', () => {
    it('pins the appointment status values used by the database', () => {
      expect(AppointmentStatus.REQUESTED).toBe('requested');
      expect(AppointmentStatus.SCHEDULED).toBe('scheduled');
      expect(AppointmentStatus.CHECKED_IN).toBe('checked_in');
      expect(AppointmentStatus.IN_PROGRESS).toBe('in_progress');
      expect(AppointmentStatus.COMPLETED).toBe('completed');
      expect(AppointmentStatus.CANCELLED).toBe('cancelled');
      expect(AppointmentStatus.NO_SHOW).toBe('no_show');
    });

    it('pins the appointment type values', () => {
      expect(AppointmentType.CONSULTATION).toBe('consultation');
      expect(AppointmentType.EMERGENCY).toBe('emergency');
      expect(getArrayFromEnum(AppointmentType)).toHaveLength(8);
    });

    it('pins the user role values', () => {
      expect(UserRole.VETERINARIAN).toBe('veterinarian');
      expect(UserRole.CLINIC_ADMIN).toBe('clinic_admin');
      expect(UserRole.CLIENT).toBe('client');
    });
  });
});
