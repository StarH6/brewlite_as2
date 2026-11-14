import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload, LoginResponse, PublicUser } from './auth.types';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

/** ADR-008: salt rounds >= 10. */
export const BCRYPT_SALT_ROUNDS = 10;

const PUBLIC_USER_SELECT = {
  userId: true,
  email: true,
  username: true,
  role: true,
  loyaltyPoints: true,
} as const;

type PublicUserRow = {
  userId: string;
  email: string;
  username: string;
  role: PublicUser['role'];
  loyaltyPoints: number;
};

function toPublicUser(user: PublicUserRow): PublicUser {
  return { id: user.userId, email: user.email, username: user.username, role: user.role, loyaltyPoints: user.loyaltyPoints,};
}

/** Lỗi trùng khóa unique của Prisma (P2002), nhận diện theo mã lỗi. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class AuthService {
  /**
   * Hash giả để so sánh khi email không tồn tại, giúp thời gian phản hồi
   * giữa "sai email" và "sai mật khẩu" không chênh lệch (chống dò email).
   */
  private readonly dummyHash = bcrypt.hashSync('brewlite-dummy-password', BCRYPT_SALT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** FR-04: đăng ký. Email trùng trả 409. Mật khẩu chỉ lưu dưới dạng hash bcrypt. */
  async register(dto: RegisterDto): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const username = dto.username ?? dto.email.split('@')[0].slice(0, 50);

    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, username, passwordHash },
        select: PUBLIC_USER_SELECT,
      });
      return toPublicUser(user);
    } catch (error) {
      // Dựa vào unique index của DB (không check-rồi-insert) nên an toàn khi 2 request đăng ký cùng lúc.
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email đã được sử dụng.',
        });
      }
      throw error;
    }
  }

  /** FR-04: đăng nhập. Sai email/mật khẩu hoặc tài khoản bị khóa đều trả 401 cùng một thông báo. */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? this.dummyHash,
    );

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    const payload: JwtPayload = { sub: user.userId, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    return { accessToken, tokenType: 'Bearer', user: toPublicUser(user) };
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: PUBLIC_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }

    return toPublicUser(user);
  }
}
