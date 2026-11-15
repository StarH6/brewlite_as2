import type { UserRole } from '@prisma/client';

/** Nội dung (claims) trong JWT. `sub` là userId theo chuẩn JWT. */
export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

/** Người dùng đã xác thực, gắn vào request bởi JwtAuthGuard. Role luôn đọc lại từ DB. */
export type AuthenticatedUser = {
  userId: string;
  email: string;
  role: UserRole;
};

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  loyaltyPoints: number;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  user: PublicUser;
};
