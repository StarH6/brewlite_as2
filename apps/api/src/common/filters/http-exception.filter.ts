import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorBody = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

/**
 * Chuẩn hoá response lỗi theo architecture §5.2:
 * { statusCode, code, message, details?, path, timestamp }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;

    let code = status === HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
    let message: string | string[] =
      status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Đã xảy ra lỗi không mong muốn.'
        : 'Yêu cầu không hợp lệ.';
    let details: unknown;

    if (typeof raw === 'string') {
      message = raw;
    } else if (raw && typeof raw === 'object') {
      const body = raw as ErrorBody;
      if (body.code) code = body.code;
      if (body.message) message = body.message;
      details = body.details;
    }

    if (Array.isArray(message)) {
      details = details ?? message;
      message = 'Dữ liệu đầu vào không hợp lệ.';
      if (code === 'HTTP_ERROR') code = 'VALIDATION_ERROR';
    }

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
