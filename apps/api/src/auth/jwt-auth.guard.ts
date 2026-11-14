import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from './auth.types';

/**
 * Bảo vệ route cần đăng nhập: `@UseGuards(JwtAuthGuard)`.
 * Thiếu token, token sai chữ ký hoặc hết hạn đều trả 401 theo định dạng lỗi chung.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(err: unknown, user: TUser | false): TUser {
    if (err instanceof HttpException) {
      throw err;
    }

    if (err || !user) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Thiếu hoặc sai token đăng nhập.',
      });
    }

    return user;
  }
}
