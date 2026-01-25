import { pgTable, uuid, varchar, timestamp, text, boolean } from 'drizzle-orm/pg-core';

/**
 * Example schema file - Replace with your actual table schemas
 * 
 * This is a template showing how to define tables with Drizzle ORM
 * 
 * Example: Users table
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Example: Pets table with foreign key
 */
export const pets = pgTable('pets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  species: varchar('species', { length: 100 }),
  breed: varchar('breed', { length: 100 }),
  clientId: uuid('client_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types for TypeScript inference
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Pet = typeof pets.$inferSelect;
export type NewPet = typeof pets.$inferInsert;



