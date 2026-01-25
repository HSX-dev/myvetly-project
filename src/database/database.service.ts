import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private connectionString: string | null = null;
  private client: postgres.Sql | null = null;
  public db: ReturnType<typeof drizzle> | null = null;
  private isConnected = false;

  constructor(private configService: ConfigService) {
    // Get the database connection string from Supabase
    // Use the connection pooler URL for better performance
    const connectionString = this.configService.get<string>('database.url');
    
    if (!connectionString || connectionString.includes('[YOUR_DATABASE_PASSWORD]')) {
      console.warn('⚠️  Database connection URL is not configured or contains placeholder. Database features will be disabled.');
      return;
    }
    
    this.connectionString = connectionString;

    try {
      // Create postgres client
      this.client = postgres(this.connectionString, {
        max: 10, // Maximum number of connections in the pool
        idle_timeout: 20, // Close idle clients after 20 seconds
        connect_timeout: 10, // Connection timeout in seconds
      });

      // Initialize Drizzle with schema
      this.db = drizzle(this.client, { schema });
    } catch (error) {
      console.warn('⚠️  Failed to initialize database client:', error);
    }
  }

  async onModuleInit() {
    if (!this.client || !this.connectionString) {
      console.warn('⚠️  Database not configured. Skipping connection test.');
      return;
    }

    // Test the connection
    try {
      await this.client`SELECT 1`;
      this.isConnected = true;
      console.log('✅ Database connection established');
    } catch (error) {
      console.warn('⚠️  Database connection failed. Database features will be disabled.');
      console.warn('   Make sure DATABASE_URL is correctly configured in .env.local');
      this.isConnected = false;
      // Don't throw - allow app to continue without database
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.end();
        console.log('🔌 Database connection closed');
      } catch (error) {
        console.warn('⚠️  Error closing database connection:', error);
      }
    }
  }

  /**
   * Get the Drizzle database instance
   * Returns null if database is not configured or not connected
   */
  getDb() {
    if (!this.isConnected || !this.db) {
      throw new Error('Database is not connected. Please configure DATABASE_URL in .env.local');
    }
    return this.db;
  }

  /**
   * Check if database is connected
   */
  isDbConnected(): boolean {
    return this.isConnected && this.db !== null;
  }
}

