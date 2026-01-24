// Base entity for Supabase-based entities
// Since we're using Supabase, we don't use TypeORM entities
// This is a base class for common entity patterns

export abstract class BaseEntity {
  id: string;
  created_at?: Date;
  updated_at?: Date;
}

