# Vetly API - Complete Postman Collection

This directory contains a comprehensive Postman collection for testing all endpoints in the Vetly backend API.

## Files

- `vetly-api-pilot.postman_collection.json` - Complete Postman collection with all endpoints organized into folders
- `vetly-api-pilot.postman_environment.json` - Postman environment variables
- `README.md` - This file

## Quick Start

### Step 1: Import into Postman

**First Time Import:**
1. Open Postman
2. Click **Import** button (top left)
3. Import both files:
   - `vetly-api-pilot.postman_collection.json`
   - `vetly-api-pilot.postman_environment.json`

**Updating Collection (After Initial Setup):**
- **If only the collection file changed**: Use **Import** → Select the collection file → Choose **"Update"** instead of **"Replace"** to preserve your environment values
- **If the environment file changed**: 
  - **Option 1 (Recommended)**: Export your current environment first (Environment → Export), then import the new environment file. This way you can manually copy your values over.
  - **Option 2**: Import the new environment file, then re-enter your values (takes ~2 minutes)
  
**Pro Tip**: After setting up your environment values the first time, export your environment (Environment → Export) and save it as `vetly-api-pilot.postman_environment.local.json`. This way you can quickly restore your values if needed.

### Step 2: Configure Environment Variables

1. In Postman, click on **Environments** (left sidebar)
2. Select **"Vetly API - Complete Environment"**
3. Update the following **required** variables:

   | Variable | Description | Where to Find |
   |----------|-------------|---------------|
   | `baseUrl` | Backend API URL | Default: `http://localhost:3000` (change if different) |
   | `supabaseUrl` | Your Supabase project URL | Supabase Dashboard > Settings > API > Project URL |
   | `supabaseAnonKey` | Supabase anonymous key | Supabase Dashboard > Settings > API > anon/public key |
   | `supabaseEmail` | Your user email | Your Supabase user account email |
   | `supabasePassword` | Your user password | Your Supabase user account password |
   | `organization_id` | Organization UUID | **Auto-populated** from `GET /api/users/me` after login |
   | `clinic_id` | Clinic UUID | **Auto-populated** from `GET /api/users/me` after login |

4. **Optional** variables (auto-populated):
   - `token` - Automatically set by pre-request script
   - `tokenExpiry` - Automatically set by pre-request script
   - `client_id` - Set after running "Get All Clients" (copy from response)

### Step 3: Select the Environment

1. In Postman, click the environment dropdown (top right)
2. Select **"Vetly API - Complete Environment"**

### Step 4: Test the Endpoints

#### 1. Health Check (Requires Authentication)

- **Request**: `GET /api`
- **Purpose**: Verify API is running and authentication works
- **Run**: Click **Send**
- **What Happens**:
  - Pre-request script automatically fetches token from Supabase
  - Token is added to Authorization header
  - Request is sent with authentication
- **Expected**: Status 200 with "Hello" message

#### 2. Get All Clients (Requires Authentication)

- **Request**: `GET /api/clients`
- **Purpose**: List all clients for your clinic
- **Run**: Click **Send**
- **What Happens**:
  - Pre-request script automatically fetches token from Supabase
  - Token is added to Authorization header
  - Request is sent with authentication
  - **Test script automatically extracts the first client ID** and stores it in `client_id` environment variable
- **Expected**: Status 200 with array of clients
- **Important**: The first client's ID is automatically saved to `client_id` for use in Update/Delete requests

#### 3. Create Client (Requires Authentication)

- **Request**: `POST /api/clients`
- **Purpose**: Create a new client
- **Before Running**:
  - `organization_id` and `clinic_id` are automatically set by pre-request script
  - Update the request body with your test data (organization_id and clinic_id are already included via variables)
- **Run**: Click **Send**
- **Expected**: Status 201 with created client object
- **Tip**: Copy the `id` from response to use in Update/Delete requests

#### 4. Update Client (Requires Authentication)

- **Request**: `PATCH /api/clients/:id`
- **Purpose**: Update an existing client
- **Before Running**:
  - **IMPORTANT**: Run "Get All Clients" first to automatically set `client_id`
  - Or manually set `client_id` environment variable with a valid client UUID
  - Update request body with fields to update
- **Run**: Click **Send**
- **What Happens**:
  - Pre-request script validates that `client_id` is set (will error if not)
  - Request is sent with the client ID from environment variable
- **Expected**: Status 200 with updated client object
- **Error**: If you get 404, make sure you ran "Get All Clients" first to set `client_id`

#### 5. Delete Client (Requires Authentication)

- **Request**: `DELETE /api/clients/:id`
- **Purpose**: Soft delete a client
- **Before Running**:
  - **IMPORTANT**: Run "Get All Clients" first to automatically set `client_id`
  - Or manually set `client_id` environment variable with a valid client UUID
- **Run**: Click **Send**
- **What Happens**:
  - Pre-request script validates that `client_id` is set (will error if not)
  - Request is sent with the client ID from environment variable
- **Expected**: Status 200 or 204 (No Content)
- **Error**: If you get 404, make sure you ran "Get All Clients" first to set `client_id`

## How Authentication Works

### Automatic Token and User Profile Management

The collection includes a **pre-request script** that automatically:

1. **Checks for existing token**: If you have a valid token (not expired), it uses that
2. **Fetches new token**: If no token or token expired, it calls Supabase auth API
3. **Stores token**: Saves the token in environment variable `token`
4. **Fetches user profile**: After getting token, calls `GET /api/users/me` to get user profile
5. **Extracts organization_id and clinic_id**: Automatically stores these from the user profile response
6. **Adds to requests**: Token is automatically added to `Authorization: Bearer <token>` header

### Token Refresh

- Tokens are automatically refreshed when they expire (or expire within 5 minutes)
- Token expiry is tracked in `tokenExpiry` environment variable
- You don't need to manually manage tokens

### Manual Token Override

If you want to use a token you already have:

1. Get your token from Supabase (via frontend or Supabase dashboard)
2. Set `token` variable in environment
3. Set `tokenExpiry` to a future timestamp (Unix timestamp in seconds)

## Troubleshooting

### Error: "Missing Supabase credentials"

**Solution**: Make sure all required environment variables are set:
- `supabaseUrl`
- `supabaseAnonKey`
- `supabaseEmail`
- `supabasePassword`

### Error: 401 Unauthorized

**Possible Causes**:
1. Invalid Supabase credentials (email/password)
2. Token expired and refresh failed
3. User doesn't exist in Supabase

**Solution**:
1. Verify your email and password are correct
2. Check Postman Console (View > Show Postman Console) for token fetch errors
3. Try manually setting a fresh token

### Error: 400 Bad Request

**Possible Causes**:
1. Missing required fields in request body
2. Invalid data format
3. `organization_id` or `clinic_id` not fetched (user profile API failed)

**Solution**:
1. Check request body matches DTO requirements
2. Check Postman Console to see if user profile was fetched successfully
3. Verify `GET /api/users/me` returns organization_id and clinic_id
4. Review error message in response for specific field issues

### Error: 404 Not Found

**Possible Causes**:
1. Wrong `baseUrl` (API not running)
2. Wrong endpoint path
3. **Missing client_id** (for Update/Delete - most common cause)
4. Resource doesn't exist (for Update/Delete)

**Solution**:
1. Verify API is running on the `baseUrl` port
2. Check endpoint path is correct
3. **For Update/Delete requests**: 
   - Make sure you ran "Get All Clients" first to automatically set `client_id`
   - Or manually set `client_id` environment variable
   - Check Postman Console for pre-request script errors
4. Verify the client ID exists in the database

### Token Not Being Fetched

**Check**:
1. Postman Console (View > Show Postman Console) for script errors
2. Environment is selected (top right dropdown)
3. Pre-request script is enabled in collection settings

## Environment Variables Reference

### Required Variables

| Variable | Type | Description |
|----------|------|-------------|
| `baseUrl` | string | Backend API base URL (e.g., `http://localhost:3000`) |
| `supabaseUrl` | string | Supabase project URL (e.g., `https://xxx.supabase.co`) |
| `supabaseAnonKey` | secret | Supabase anonymous/public key |
| `supabaseEmail` | string | User email for authentication |
| `supabasePassword` | secret | User password for authentication |
| `organization_id` | string | Organization UUID (auto-populated from user profile) |
| `clinic_id` | string | Clinic UUID (auto-populated from user profile) |

### Auto-Managed Variables

| Variable | Type | Description |
|----------|------|-------------|
| `token` | secret | JWT token (auto-populated by pre-request script) |
| `tokenExpiry` | string | Token expiry timestamp (auto-populated) |
| `organization_id` | string | Organization UUID (auto-populated from `GET /api/users/me`) |
| `clinic_id` | string | Clinic UUID (auto-populated from `GET /api/users/me`) |

### Optional Variables

| Variable | Type | Description |
|----------|------|-------------|
| `client_id` | string | Client UUID (set after Get All Clients) |

## Understanding Required vs Optional Fields

### How to Identify Required Fields

In Postman request bodies, you'll see comments indicating required vs optional fields:

- **REQUIRED FIELDS**: Fields marked with `// REQUIRED:` comment
  - These fields **must** be provided in the request
  - Missing required fields will result in a 400 Bad Request error
  - In the backend DTOs, these fields do NOT have `@IsOptional()` decorator

- **OPTIONAL FIELDS**: Fields marked with `// Optional:` comment
  - These fields can be omitted from the request
  - In the backend DTOs, these fields have `@IsOptional()` decorator or TypeScript `?` modifier

### Example from Create Client Request:

```json
{
  // REQUIRED FIELDS (must be provided):
  "organization_id": "{{organization_id}}",  // REQUIRED: UUID of organization
  "clinic_id": "{{clinic_id}}",              // REQUIRED: UUID of clinic
  
  // OPTIONAL FIELDS (can be omitted):
  "first_name": "John",                       // Optional: First name
  "email": "john.doe@example.com",           // Optional: Email address
  "phone": "+1-555-0123"                     // Optional: Phone number
}
```

### Checking DTOs in Backend Code

If you need to verify which fields are required:
1. Navigate to `vetly-api/src/{module}/dto/` directory
2. Open the DTO file (e.g., `create-client.dto.ts`)
3. Look for fields:
   - **Required**: No `@IsOptional()` decorator, no `?` in TypeScript
   - **Optional**: Has `@IsOptional()` decorator or `?` in TypeScript

## Sample Request Bodies

### Create Client

**Required Fields:**
- `organization_id` (UUID) - Organization ID
- `clinic_id` (UUID) - Clinic ID

**Optional Fields:**
All other fields are optional. See the request body in Postman for the complete list with comments.

### Update Client

**All fields are optional** - only include fields you want to update:

```json
{
  // All fields are optional - only include what you want to update
  "phone": "+1-555-9999",
  "address_street": "456 Oak Avenue",
  "address_city": "Springfield",
  "address_state": "IL",
  "address_zip": "62702",
  "comm_sms_ok": true
}
```

## Next Steps (Phase 2)

Once this pilot collection works successfully, Phase 2 will include:

- Complete collection with ALL endpoints
- Organized into logical folders (Clients, Pets, Appointments, etc.)
- Comprehensive test data based on original Vetly project
- Additional test scripts for response validation
- Collection-level variables for common IDs

## Managing Environment Values

### Preserving Your Values When Updating

**Collections vs Environments:**
- **Collection updates** (`.postman_collection.json`): Your environment values are **NOT affected** - they persist
- **Environment updates** (`.postman_environment.json`): May reset values if you import a new version

**Best Practices:**

1. **Export Your Environment After Setup**:
   - In Postman: Click on your environment → Click the "..." menu → Export
   - Save as `vetly-api-pilot.postman_environment.local.json` (add to `.gitignore` if using git)
   - This is your personal backup with your credentials

2. **When Updating Collection Only**:
   - Import the collection file
   - Choose "Update" if prompted (preserves environment)
   - Your environment values remain unchanged ✅

3. **When Updating Environment File**:
   - **Option A**: Import new environment → Re-enter values (takes ~2 minutes)
   - **Option B**: Manually update only the changed variables in Postman UI
   - **Option C**: Import new environment → Copy values from your exported `.local.json` file

4. **Using Git?**:
   - Add `*.postman_environment.local.json` to `.gitignore`
   - Keep the template environment file in git (with placeholder values)
   - Each developer maintains their own local environment file

### Quick Value Reference

After first setup, you only need to set these once (they persist):
- `supabaseUrl`
- `supabaseAnonKey`
- `supabaseEmail`
- `supabasePassword`
- `baseUrl` (if different from default)

These are auto-managed (you don't need to set them):
- `token` (auto-populated)
- `tokenExpiry` (auto-populated)
- `organization_id` (auto-populated)
- `clinic_id` (auto-populated)
- `client_id` (auto-populated from Get All Clients)

## Support

If you encounter issues:

1. Check Postman Console for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure API is running and accessible
4. Review backend logs for server-side errors

