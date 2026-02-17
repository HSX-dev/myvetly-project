# Drizzle ORM Setup for Supabase

This directory contains the Drizzle ORM configuration for connecting to your Supabase PostgreSQL database.

## Configuration

1. **Environment Variables**: Add to your `.env` file:
   ```env
   DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true
   ```
   
   Or use direct connection:
   ```env
   DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT_REF].supabase.co:5432/postgres
   ```

   **Note**: Use the connection pooler (port 6543) for better performance in production.

2. **Get your connection string from Supabase**:
   - Go to your Supabase project dashboard
   - Navigate to Settings → Database
   - Copy the "Connection string" (use the "Session mode" for connection pooling)

## Usage

### In Services

Inject `DatabaseService` into your services:

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class UsersService {
  constructor(private dbService: DatabaseService) {}

  async findAll() {
    const db = this.dbService.getDb();
    return await db.select().from(users);
  }

  async findOne(id: string) {
    const db = this.dbService.getDb();
    return await db.select().from(users).where(eq(users.id, id)).limit(1);
  }

  async create(userData: NewUser) {
    const db = this.dbService.getDb();
    return await db.insert(users).values(userData).returning();
  }

  async update(id: string, userData: Partial<NewUser>) {
    const db = this.dbService.getDb();
    return await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
  }

  async delete(id: string) {
    const db = this.dbService.getDb();
    return await db.delete(users).where(eq(users.id, id)).returning();
  }
}
```

## Schema Definition

Define your tables in `src/database/schema/` directory:

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

Then export from `src/database/schema/index.ts`:
```typescript
export * from './users.schema';
```

## Migrations

### Generate migrations:
```bash
npm run db:generate
```

### Push schema changes directly (development):
```bash
npm run db:push
```

### Run migrations:
```bash
npm run db:migrate
```

### Open Drizzle Studio (database GUI):
```bash
npm run db:studio
```

## Benefits of Drizzle ORM

- ✅ **Type Safety**: Full TypeScript inference
- ✅ **Performance**: Lightweight and fast
- ✅ **Supabase Native**: Built for PostgreSQL
- ✅ **SQL-like Syntax**: Familiar query building
- ✅ **Migrations**: Built-in migration system

## Resources

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Drizzle with Supabase](https://orm.drizzle.team/docs/connect-supabase)
- [Drizzle PostgreSQL Guide](https://orm.drizzle.team/docs/get-started-postgresql)








