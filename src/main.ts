import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const nodeEnv = configService.get<string>('nodeEnv');
  const corsOrigins = configService.get<string[]>('cors.origins');

  // Enable CORS for mobile app and portal
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Set global prefix for API routes
  app.setGlobalPrefix('api');

  const port = configService.get<number>('port') || 3000;
  await app.listen(port);
  console.log(`🚀 Vetly API running on port ${port} [${nodeEnv}]`);
}
bootstrap();
