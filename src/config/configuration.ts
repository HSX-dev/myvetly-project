export default () => ({
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  database: {
    // Use Supabase's connection pooler URL for better performance
    // Format: postgresql://postgres:[PASSWORD]@[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true
    // Or use direct connection: postgresql://postgres:[PASSWORD]@[PROJECT_REF].supabase.co:5432/postgres
    url: process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL,
  },
  
  ai: {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET,
  },

  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173',
    ],
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  },
});
