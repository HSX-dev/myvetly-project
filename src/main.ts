
import { NestFactory, Reflector } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ExcludeInterceptor } from './utils/interceptors/exclude.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import * as bodyParser from 'body-parser';
import { SwaggerModule } from '@nestjs/swagger';
import { OpenAPIObject } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

async function bootstrap() {
  // Disable NestJS's default body parser so we can configure our own with custom limits
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable default body parser
  });
  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);

  const nodeEnv = configService.get<string>('nodeEnv');
  const corsOrigins = configService.get<string[]>('cors.origins') || [];
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';

  // Configure body parser with increased size limit (10MB, default is 100kb)
  // This is needed for clinic settings and other endpoints that may send larger payloads
  // Access the underlying Express instance that NestJS already has loaded
  const expressInstance = app.getHttpAdapter().getInstance();

  // Apply body parser middleware with increased limits using proper import
  // Using import instead of require ensures proper module resolution
  expressInstance.use(bodyParser.json({ limit: '10mb' }));
  expressInstance.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Enable CORS
  // Security: In production, only allow specific origins. Never allow all origins in production.
  if (isProduction && corsOrigins.length === 0) {
    console.warn('⚠️  SECURITY WARNING: No CORS origins configured in production!');
    console.warn('   Set CORS_ORIGINS environment variable or update configuration.ts defaults');
  }

  app.enableCors({
    origin: isDevelopment ? true : corsOrigins.length > 0 ? corsOrigins : false, // Never allow all origins in production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
  });

  // Enable validation - always return field-level error messages so frontend can show what to fix
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        excludeExtraneousValues: false, // Default: expose all properties unless @Exclude() is used
      },
      disableErrorMessages: false, // Always include validation messages for frontend
      forbidNonWhitelisted: isProduction, // Strict validation in production
      exceptionFactory: (errors) => {
        // Format validation errors as { field, messages } for frontend to display
        const formatted = errors.map((err) => {
          const field = err.property;
          const messages = err.constraints
            ? Object.values(err.constraints)
            : err.children
              ? ['Invalid value']
              : ['Validation failed'];
          return { field, messages };
        });
        return new BadRequestException({
          message: 'Validation failed. Please fix the highlighted fields.',
          errors: formatted,
        });
      },
    }),
  );

  // Global interceptor to clean response data
  app.useGlobalInterceptors(new ExcludeInterceptor());

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger UI setup using OpenAPI YAML generated from Postman
  // Setup Swagger BEFORE global prefix so it's accessible at /swagger (not /api/swagger)
  try {
    // Resolve swagger.yaml path - try multiple locations
    const possiblePaths = [
      path.join(process.cwd(), 'swagger.yaml'), // Root of project
      path.join(__dirname, '..', 'swagger.yaml'), // Relative to dist/src
      path.join(__dirname, '../../swagger.yaml'), // Relative to src
      'swagger.yaml', // Current working directory
    ];

    let swaggerPath: string | null = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        swaggerPath = possiblePath;
        break;
      }
    }

    if (!swaggerPath) {
      throw new Error(`swagger.yaml not found. Tried: ${possiblePaths.join(', ')}`);
    }

    const openApiDoc = fs.readFileSync(swaggerPath, 'utf8');
    const document = yaml.load(openApiDoc) as OpenAPIObject;
    SwaggerModule.setup('swagger', app, document, {
      customSiteTitle: 'Vetly API Documentation',
    });
    console.log('✅ Swagger UI available at http://localhost:8000/swagger');
  } catch (e) {
    console.warn('⚠️  Could not load OpenAPI YAML for Swagger UI:', e.message);
    console.warn('   Make sure swagger.yaml exists in the project root');
  }

  // Set global prefix for API routes (after Swagger setup)
  // This means API routes will be at /api/* but Swagger stays at /swagger
  app.setGlobalPrefix('api');

  // Enable detailed error stack traces only in development
  if (isDevelopment) {
    // In development, you might want to enable more detailed error responses
    // This can be handled by a custom exception filter if needed
  }

  const port = configService.get<number>('port') || 8000;
  await app.listen(port);

  // Environment-specific startup messages
  if (isDevelopment) {
    console.log(`🚀 Vetly API running on port ${port} [${nodeEnv}]`);
    console.log(`📝 Development mode - Detailed errors enabled`);
  } else if (isProduction) {
    console.log(`🚀 Vetly API running on port ${port} [${nodeEnv}]`);
    console.log(`🔒 Production mode - Security features enabled`);
  } else {
    console.log(`🚀 Vetly API running on port ${port} [${nodeEnv}]`);
  }
}
bootstrap();
