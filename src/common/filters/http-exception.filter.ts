import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || exception.message;
        error = resp.error || 'Error';
        details = resp.details ?? resp.errors;
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      
      // Log unexpected errors
      this.logger.error(
        `Unexpected error: ${exception.message}`,
        exception.stack,
      );
    }

    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };
    if (details !== undefined) {
      errorResponse.errors = details;
    }

    // Log all errors in development
    if (process.env.NODE_ENV === 'development') {
      this.logger.error(`${request.method} ${request.url}`, errorResponse);
    }

    response.status(status).json(errorResponse);
  }
}
