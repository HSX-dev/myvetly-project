import configuration from '../../config/configuration';

/**
 * Regression cover for the environment-driven configuration factory.
 * Every assertion here describes behaviour the API already relies on at
 * bootstrap time, so the factory can never silently change its defaults.
 */
describe('configuration factory', () => {
  const ENV_KEYS = [
    'PORT',
    'NODE_ENV',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'DATABASE_URL',
    'SUPABASE_DATABASE_URL',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'Gemeni_API_Key',
    'REDIS_URL',
    'JWT_SECRET',
    'RATE_LIMIT_TTL',
    'RATE_LIMIT_MAX',
    'CORS_ORIGINS',
    'LOG_LEVEL',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
  ];

  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  describe('server settings', () => {
    it('falls back to port 8000 when PORT is not set', () => {
      expect(configuration().port).toBe(8000);
    });

    it('parses PORT as a base-ten integer', () => {
      process.env.PORT = '3001';
      expect(configuration().port).toBe(3001);
    });

    it('defaults nodeEnv to development', () => {
      expect(configuration().nodeEnv).toBe('development');
    });

    it('reads nodeEnv from NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      expect(configuration().nodeEnv).toBe('production');
    });
  });

  describe('supabase and database', () => {
    it('reads the supabase url and service key', () => {
      process.env.SUPABASE_URL = 'https://project.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'service-key';

      expect(configuration().supabase).toEqual({
        url: 'https://project.supabase.co',
        serviceKey: 'service-key',
      });
    });

    it('leaves supabase values undefined when nothing is configured', () => {
      const supabase = configuration().supabase;
      expect(supabase.url).toBeUndefined();
      expect(supabase.serviceKey).toBeUndefined();
    });

    it('prefers DATABASE_URL over SUPABASE_DATABASE_URL', () => {
      process.env.DATABASE_URL = 'postgresql://primary/db';
      process.env.SUPABASE_DATABASE_URL = 'postgresql://secondary/db';

      expect(configuration().database.url).toBe('postgresql://primary/db');
    });

    it('falls back to SUPABASE_DATABASE_URL when DATABASE_URL is absent', () => {
      process.env.SUPABASE_DATABASE_URL = 'postgresql://secondary/db';
      expect(configuration().database.url).toBe('postgresql://secondary/db');
    });
  });

  describe('ai provider keys', () => {
    it('reads the deepseek and openai keys', () => {
      process.env.DEEPSEEK_API_KEY = 'ds-key';
      process.env.OPENAI_API_KEY = 'oa-key';

      const ai = configuration().ai;
      expect(ai.deepseekApiKey).toBe('ds-key');
      expect(ai.openaiApiKey).toBe('oa-key');
    });

    it('prefers the correctly spelled gemini key', () => {
      process.env.GEMINI_API_KEY = 'correct';
      process.env.Gemeni_API_Key = 'typo';

      expect(configuration().ai.geminiApiKey).toBe('correct');
    });

    it('falls back to the misspelled gemini key used by the hosting provider', () => {
      process.env.Gemeni_API_Key = 'typo';
      expect(configuration().ai.geminiApiKey).toBe('typo');
    });
  });

  describe('redis, jwt and rate limiting', () => {
    it('defaults the redis url to localhost', () => {
      expect(configuration().redis.url).toBe('redis://localhost:6379');
    });

    it('reads a configured redis url', () => {
      process.env.REDIS_URL = 'redis://cache:6380';
      expect(configuration().redis.url).toBe('redis://cache:6380');
    });

    it('reads the jwt secret', () => {
      process.env.JWT_SECRET = 'top-secret';
      expect(configuration().jwt.secret).toBe('top-secret');
    });

    it('defaults rate limiting to 100 requests per 60 seconds', () => {
      expect(configuration().rateLimit).toEqual({ ttl: 60000, max: 100 });
    });

    it('parses configured rate limit values as integers', () => {
      process.env.RATE_LIMIT_TTL = '1000';
      process.env.RATE_LIMIT_MAX = '5';

      expect(configuration().rateLimit).toEqual({ ttl: 1000, max: 5 });
    });
  });

  describe('cors origins', () => {
    it('ships localhost development origins by default', () => {
      const origins = configuration().cors.origins;
      expect(origins).toContain('http://localhost:3000');
      expect(origins).toContain('http://localhost:5173');
    });

    it('splits CORS_ORIGINS on commas', () => {
      process.env.CORS_ORIGINS = 'https://a.example,https://b.example';
      expect(configuration().cors.origins).toEqual([
        'https://a.example',
        'https://b.example',
      ]);
    });

    it('drops blank entries from CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = 'https://a.example,,   ,https://b.example';
      expect(configuration().cors.origins).toEqual([
        'https://a.example',
        'https://b.example',
      ]);
    });
  });

  describe('logging and third party integrations', () => {
    it('defaults the log level to info', () => {
      expect(configuration().logging.level).toBe('info');
    });

    it('reads a configured log level', () => {
      process.env.LOG_LEVEL = 'debug';
      expect(configuration().logging.level).toBe('debug');
    });

    it('reads the stripe key pair', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test';
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';

      expect(configuration().stripe).toEqual({
        secretKey: 'sk_test',
        publishableKey: 'pk_test',
      });
    });

    it('reads the google oauth triple', () => {
      process.env.GOOGLE_CLIENT_ID = 'client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
      process.env.GOOGLE_REDIRECT_URI = 'https://api.example/callback';

      expect(configuration().google).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://api.example/callback',
      });
    });
  });
});
