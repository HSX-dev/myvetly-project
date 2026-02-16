# Appointments Status Constraint Fix

## Problem
The database constraint `appointments_status_check` is rejecting the `'no_show'` status value, causing 400 Bad Request errors when trying to update overdue appointments.

## Root Cause
There's a mismatch between:
- **Code expectations**: The code allows `'no_show'` as a valid status (see `AppointmentStatus` enum and all type definitions)
- **Database constraint**: The constraint allows `'confirmed'` but doesn't include `'no_show'` in its allowed values
- **Interesting note**: The constraint `chk_active_appointment_has_time` already references `'no_show'`, meaning the database schema expects it, but the main status constraint doesn't allow it

## Solution

### Option 1: Update Database Constraint (RECOMMENDED)
This is the best option because:
- The code consistently uses `'no_show'` throughout the application
- Frontend expects `'no_show'` as a valid status
- It's a single source of truth fix

**Steps:**
1. Run the migration file: `src/database/migrations/fix-appointments-status-constraint.sql`
2. This will update the constraint to include all 8 valid statuses:
   - `requested`
   - `scheduled`
   - `checked_in`
   - `in_progress`
   - `completed`
   - `cancelled`
   - `confirmed` (already in database, keeping it)
   - `no_show` ✅ (this is what's missing and needed by code)

### Option 2: Check Current Constraint First
Before running the migration, you can check what the current constraint allows:

1. Run the check script: `src/database/check-appointments-constraint.sql`
2. Review the output to see what statuses are currently allowed
3. If `'no_show'` is missing, proceed with Option 1

### Option 3: Update Code (NOT RECOMMENDED)
If for some reason you can't update the database constraint, you would need to:
- Remove `'no_show'` from all TypeScript types
- Update all code that uses `'no_show'`
- Change the `updateOverdueAppointments` method to use a different status

**This is NOT recommended** because:
- It requires changes across multiple files
- Frontend code also expects `'no_show'`
- It's against the intended business logic

## Files That Reference Appointment Status

### Backend (vetly-api)
- `src/utils/enums/appointment-status.enum.ts` - Defines `NO_SHOW = 'no_show'`
- `src/appointments/appointments.controller.ts` - Type definitions include `'no_show'`
- `src/appointments/appointments.service.ts` - Methods use `'no_show'` status
- `src/appointments/dto/update-appointment.dto.ts` - DTOs may reference status

### Frontend (myvetly)
- `apps/web/src/features/appointments/api/types.ts` - Type definitions include `'no_show'`
- `apps/web/src/services/supabase/appointments.ts` - Service methods use `'no_show'`

## Verification

After running the migration, verify it works:

```sql
-- This should return the constraint with all 8 statuses
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'appointments_status_check';
```

Expected output should include both `'no_show'` and `'confirmed'` in the CHECK constraint.

**Current constraint (before migration):**
- Allows: `requested`, `scheduled`, `checked_in`, `in_progress`, `completed`, `cancelled`, `confirmed`
- Missing: `no_show` ❌

**After migration:**
- Allows: `requested`, `scheduled`, `checked_in`, `in_progress`, `completed`, `cancelled`, `confirmed`, `no_show` ✅

## Testing

After the migration:
1. Test the `PATCH /api/appointments/clinic/:clinicId/update-overdue` endpoint
2. It should successfully update overdue appointments to `'no_show'` status
3. No more constraint violation errors

