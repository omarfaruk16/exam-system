import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@exam/types';
import type { AuthUser } from '../types/auth';

/**
 * Single place that turns any thrown error into a consistent ApiErrorBody.
 * Maps common Prisma errors to sensible HTTP codes and never leaks internals in production.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Something went wrong';
    let estimatedResume: string | null | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as {
          message?: string | string[];
          error?: string;
          estimatedResume?: string | null;
        };
        message = b.message ?? exception.message;
        error = b.error ?? error;
        if ('estimatedResume' in b) estimatedResume = b.estimatedResume;
      }
      if (error === 'Internal Server Error') error = exception.name.replace(/Exception$/, '');
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, error, message } = this.mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = 'Invalid query parameters';
    }

    const payload: ApiErrorBody = {
      statusCode: status,
      error,
      message,
      requestId: req.id,
      timestamp: new Date().toISOString(),
      ...(estimatedResume !== undefined ? { estimatedResume } : {}),
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}: ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
      // Report server errors to Sentry with user + request context (no-op if DSN is unset).
      const user = req.user as AuthUser | undefined;
      Sentry.withScope((scope) => {
        if (user) scope.setUser({ id: String(user.id), username: user.username });
        scope.setContext('request', {
          method: req.method,
          url: req.url,
          requestId: req.id,
          roles: user?.roles.map((r) => r.role),
        });
        Sentry.captureException(exception);
      });
    } else {
      this.logger.debug(`${req.method} ${req.url} -> ${status}: ${JSON.stringify(message)}`);
    }

    res.status(status).json(payload);
  }

  private mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    error: string;
    message: string;
  } {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[] | undefined)?.join(', ');
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: target ? `A record with that ${target} already exists` : 'Duplicate value',
        };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, error: 'Not Found', message: 'Record not found' };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Related record does not exist',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Database Error',
          message: 'A database error occurred',
        };
    }
  }
}
