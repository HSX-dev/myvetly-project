import { HttpException, HttpStatus } from '@nestjs/common';
import {
  BadRequestException,
  DatabaseException,
  ExternalServiceException,
  ForbiddenException,
  NotFoundException,
  RateLimitException,
  UnauthorizedException,
} from '../../common/exceptions';

/**
 * Regression cover for the shared HTTP exception catalogue. The response
 * bodies produced here are what clients already parse, so both the status
 * codes and the literal `error` strings are pinned.
 */
describe('shared http exceptions', () => {
  const body = (exception: HttpException) => exception.getResponse() as Record<string, unknown>;

  describe('NotFoundException', () => {
    it('reports a 404 status', () => {
      expect(new NotFoundException('Pet').getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('includes the resource id in the message when one is given', () => {
      expect(body(new NotFoundException('Pet', 'abc'))).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: "Pet with id 'abc' not found",
      });
    });

    it('omits the id clause when no id is given', () => {
      expect(body(new NotFoundException('Pet')).message).toBe('Pet not found');
    });
  });

  describe('BadRequestException', () => {
    it('reports a 400 status with the supplied message', () => {
      const exception = new BadRequestException('clinic_id is required');

      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(body(exception)).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'clinic_id is required',
      });
    });
  });

  describe('UnauthorizedException', () => {
    it('defaults to a generic unauthorized message', () => {
      const exception = new UnauthorizedException();

      expect(exception.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(body(exception).message).toBe('Unauthorized access');
    });

    it('accepts a custom message', () => {
      expect(body(new UnauthorizedException('Token expired')).message).toBe('Token expired');
    });

    it('labels the error as Unauthorized', () => {
      expect(body(new UnauthorizedException()).error).toBe('Unauthorized');
    });
  });

  describe('ForbiddenException', () => {
    it('defaults to a generic forbidden message', () => {
      const exception = new ForbiddenException();

      expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(body(exception)).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Access forbidden',
      });
    });

    it('accepts a custom message', () => {
      expect(body(new ForbiddenException('Wrong clinic')).message).toBe('Wrong clinic');
    });
  });

  describe('RateLimitException', () => {
    it('reports a 429 status with a fixed message', () => {
      const exception = new RateLimitException();

      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(body(exception).message).toBe('Rate limit exceeded. Please try again later.');
    });

    it('carries the retryAfter hint when supplied', () => {
      expect(body(new RateLimitException(30)).retryAfter).toBe(30);
    });

    it('leaves retryAfter undefined when not supplied', () => {
      expect(body(new RateLimitException()).retryAfter).toBeUndefined();
    });
  });

  describe('ExternalServiceException', () => {
    it('reports a 502 status and names the service', () => {
      const exception = new ExternalServiceException('Zoom');

      expect(exception.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(body(exception)).toEqual({
        statusCode: 502,
        error: 'External Service Error',
        message: 'Failed to communicate with Zoom',
        service: 'Zoom',
      });
    });

    it('prefers an explicit message over the default one', () => {
      expect(body(new ExternalServiceException('Zoom', 'meeting quota reached')).message).toBe(
        'meeting quota reached',
      );
    });
  });

  describe('DatabaseException', () => {
    it('reports a 500 status describing the failed operation', () => {
      const exception = new DatabaseException('insert appointment');

      expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body(exception).message).toBe('Database operation failed: insert appointment');
    });

    it('passes details through untouched', () => {
      expect(body(new DatabaseException('update pet', 'constraint 23514')).details).toBe(
        'constraint 23514',
      );
    });
  });

  describe('catalogue invariants', () => {
    it('derives every exception from HttpException', () => {
      const all = [
        new NotFoundException('Pet'),
        new BadRequestException('bad'),
        new UnauthorizedException(),
        new ForbiddenException(),
        new RateLimitException(),
        new ExternalServiceException('Zoom'),
        new DatabaseException('select'),
      ];

      for (const exception of all) {
        expect(exception).toBeInstanceOf(HttpException);
      }
    });

    it('repeats the http status inside every response body', () => {
      const all = [
        new NotFoundException('Pet'),
        new BadRequestException('bad'),
        new UnauthorizedException(),
        new ForbiddenException(),
        new RateLimitException(),
        new ExternalServiceException('Zoom'),
        new DatabaseException('select'),
      ];

      for (const exception of all) {
        expect(body(exception).statusCode).toBe(exception.getStatus());
      }
    });
  });
});
