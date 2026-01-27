import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ExcludeInterceptor } from './utils/interceptors/exclude.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);

  const nodeEnv = configService.get<string>('nodeEnv');
  const corsOrigins = configService.get<string[]>('cors.origins');
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';

  // Enable CORS - more permissive in development
  app.enableCors({
    origin: isDevelopment ? true : corsOrigins, // Allow all origins in dev
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // Enable validation with environment-specific settings
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        excludeExtraneousValues: true,
      },
      // Show detailed error messages in development, generic in production
      disableErrorMessages: isProduction,
      forbidNonWhitelisted: isProduction, // Strict validation in production
    }),
  );

  // Global interceptor to clean response data
  app.useGlobalInterceptors(new ExcludeInterceptor());

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Set global prefix for API routes
  app.setGlobalPrefix('api');

  // Enable detailed error stack traces only in development
  if (isDevelopment) {
    // In development, you might want to enable more detailed error responses
    // This can be handled by a custom exception filter if needed
  }

  const port = configService.get<number>('port') || 3000;
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
