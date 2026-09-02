import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../common/filters/http-exception.filter';
import { BadRequestException, NotFoundException } from '../../common/exceptions';

interface Captured {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
}

const buildHost = (url = '/appointments', method = 'GET'): Captured => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url, method, headers: {} }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
};

/**
 * Regression cover for the global exception filter: the exact JSON envelope
 * every failing request already returns.
 */
describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    jest.restoreAllMocks();
  });

  it('answers with the status carried by the http exception', () => {
    const { host, status } = buildHost();

    filter.catch(new NotFoundException('Pet', 'p1'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('forwards the message and error label from a structured exception body', () => {
    const { host, json } = buildHost();

    filter.catch(new NotFoundException('Pet', 'p1'), host);

    expect(json).toHaveBeenCalledTimes(1);
    const payload = json.mock.calls[0][0];
    expect(payload.statusCode).toBe(404);
    expect(payload.error).toBe('Not Found');
    expect(payload.message).toBe("Pet with id 'p1' not found");
  });

  it('echoes the request path back to the client', () => {
    const { host, json } = buildHost('/pets/42');

    filter.catch(new BadRequestException('nope'), host);

    expect(json.mock.calls[0][0].path).toBe('/pets/42');
  });

  it('stamps an ISO-8601 timestamp on every response', () => {
    const { host, json } = buildHost();

    filter.catch(new BadRequestException('nope'), host);

    const timestamp = json.mock.calls[0][0].timestamp;
    expect(typeof timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  });

  it('labels an object body without an error field as a generic Error', () => {
    const { host, json } = buildHost();

    filter.catch(new HttpException({ statusCode: 418, message: 'teapot' }, 418), host);

    expect(json.mock.calls[0][0].error).toBe('Error');
    expect(json.mock.calls[0][0].message).toBe('teapot');
  });

  it('uses a string exception body as the message', () => {
    const { host, json } = buildHost();

    filter.catch(new HttpException('plain failure', HttpStatus.CONFLICT), host);

    const payload = json.mock.calls[0][0];
    expect(payload.statusCode).toBe(HttpStatus.CONFLICT);
    expect(payload.message).toBe('plain failure');
    expect(payload.error).toBe('Internal Server Error');
  });

  it('surfaces a details field as errors', () => {
    const { host, json } = buildHost();

    filter.catch(
      new HttpException({ error: 'Bad Request', message: 'invalid', details: ['a'] }, 400),
      host,
    );

    expect(json.mock.calls[0][0].errors).toEqual(['a']);
  });

  it('surfaces a validation errors array as errors', () => {
    const { host, json } = buildHost();
    const errors = [{ field: 'clinic_id', messages: ['must be a UUID'] }];

    filter.catch(new HttpException({ message: 'Validation failed', errors }, 400), host);

    expect(json.mock.calls[0][0].errors).toEqual(errors);
  });

  it('omits the errors key when the exception carries no details', () => {
    const { host, json } = buildHost();

    filter.catch(new BadRequestException('nope'), host);

    expect(Object.keys(json.mock.calls[0][0])).not.toContain('errors');
  });

  it('turns an unexpected Error into a 500 carrying its message', () => {
    const { host, status, json } = buildHost();

    filter.catch(new Error('connection reset'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const payload = json.mock.calls[0][0];
    expect(payload.error).toBe('Internal Server Error');
    expect(payload.message).toBe('connection reset');
  });

  it('logs unexpected errors through the nest logger', () => {
    const { host } = buildHost();

    filter.catch(new Error('connection reset'), host);

    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('falls back to a generic message for values that are not errors', () => {
    const { host, status, json } = buildHost();

    filter.catch('something odd', host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json.mock.calls[0][0].message).toBe('Internal server error');
  });

  it('adds request logging in development without changing the response', () => {
    process.env.NODE_ENV = 'development';
    const { host, json } = buildHost('/clients', 'POST');

    filter.catch(new BadRequestException('nope'), host);

    expect(Logger.prototype.error).toHaveBeenCalled();
    expect(json.mock.calls[0][0].message).toBe('nope');
  });
});
