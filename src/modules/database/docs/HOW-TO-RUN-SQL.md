# How to Run SQL Migrations in Supabase

## Method 1: Supabase Dashboard SQL Editor (RECOMMENDED - Easiest)

### Step 1: Access Supabase Dashboard
1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Log in to your account
3. Select your project

### Step 2: Open SQL Editor
1. In the left sidebar, click on **"SQL Editor"**
2. Click **"New query"** button (top right)

### Step 3: Run the Check Script First (Optional but Recommended)
1. Open the file: `src/database/check-appointments-constraint.sql`
2. Copy the entire SQL content
3. Paste it into the SQL Editor
4. Click **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)
5. Review the results to see what the current constraint allows

**Expected Output:**
You should see the current constraint definition. If `'no_show'` is missing, proceed to Step 4.

### Step 4: Run the Migration
1. Open the file: `src/database/migrations/fix-appointments-status-constraint.sql`
2. Copy the entire SQL content
3. Paste it into the SQL Editor
4. Click **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)

**Expected Output:**
- The migration should complete successfully
- At the end, you'll see a verification query result showing the updated constraint
- The constraint should now include all 7 statuses including `'no_show'`

### Step 5: Verify
After running the migration, you should see output like:
```
constraint_name: appointments_status_check
constraint_definition: CHECK (status = ANY (ARRAY['requested'::text, 'scheduled'::text, 'checked_in'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]))
```

---

## Method 2: Using psql Command Line

If you have direct database access via psql:

### Step 1: Get Connection String
1. In Supabase Dashboard, go to **Settings** → **Database**
2. Find your **Connection string** (URI format)
3. Copy the connection string

### Step 2: Run SQL
```bash
# Connect to database
psql "your-connection-string-here"

# Then run the SQL file
\i src/database/migrations/fix-appointments-status-constraint.sql
```

Or run directly:
```bash
psql "your-connection-string-here" -f src/database/migrations/fix-appointments-status-constraint.sql
```

---

## Method 3: Using Database Client (pgAdmin, DBeaver, etc.)

1. Connect to your Supabase database using your database client
2. Open a new SQL query window
3. Copy and paste the SQL from the migration file
4. Execute the query

**Connection Details:**
- Host: Found in Supabase Dashboard → Settings → Database
- Port: Usually `5432`
- Database: `postgres` (default)
- Username/Password: Found in Supabase Dashboard → Settings → Database

---

## Quick Reference: File Locations

- **Check Script**: `src/database/check-appointments-constraint.sql`
- **Migration Script**: `src/database/migrations/fix-appointments-status-constraint.sql`
- **Documentation**: `src/database/README-APPOINTMENTS-CONSTRAINT.md`

---

## Troubleshooting

### Error: "permission denied"
- Make sure you're using a user with sufficient permissions
- In Supabase Dashboard, you should have admin access

### Error: "constraint does not exist"
- This is okay! The `DROP CONSTRAINT IF EXISTS` will handle this gracefully
- The migration will still work

### Error: "relation appointments does not exist"
- Check that you're connected to the correct database
- Verify the table name is `appointments` (not `appointment`)

### After Migration: Still Getting Errors
1. Verify the constraint was updated:
   ```sql
   SELECT pg_get_constraintdef(oid) 
   FROM pg_constraint 
   WHERE conname = 'appointments_status_check';
   ```
2. Check that `'no_show'` appears in the output
3. If not, re-run the migration

---

## Safety Notes

✅ **Safe to Run:**
- The migration only modifies the constraint definition
- It doesn't modify any existing data
- Uses `IF EXISTS` to prevent errors if constraint doesn't exist
- Wrapped in `BEGIN/COMMIT` transaction for safety

⚠️ **Before Running:**
- Make sure you have a database backup (Supabase automatically backs up)
- Test in a development/staging environment first if possible
- Verify the constraint check script results first

---

## Need Help?

If you encounter any issues:
1. Check the error message in Supabase SQL Editor
2. Verify you're connected to the correct project
3. Ensure you have the necessary permissions
4. Review the README-APPOINTMENTS-CONSTRAINT.md for more details

