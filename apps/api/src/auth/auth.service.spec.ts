import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

type Mocked = {
  user: { create: jest.Mock; findUnique: jest.Mock };
};

function setup() {
  const prisma: Mocked = { user: { create: jest.fn(), findUnique: jest.fn() } };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
  const service = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService);
  return { service, prisma, jwt };
}

describe('AuthService', () => {
  it('register: chỉ gửi hash xuống DB, không gửi mật khẩu gốc', async () => {
    const { service, prisma } = setup();
    prisma.user.create.mockResolvedValue({
      userId: 'u1',
      email: 'a@example.com',
      username: 'a',
      role: 'CUSTOMER',
      loyaltyPoints: 0,
    });

    await service.register({ email: 'a@example.com', password: 'matkhau123' });

    const { data } = prisma.user.create.mock.calls[0][0] as {
      data: { passwordHash: string; password?: string };
    };
    expect(data.password).toBeUndefined();
    expect(await bcrypt.compare('matkhau123', data.passwordHash)).toBe(true);
  });

  it('register: P2002 thành 409, lỗi khác được ném lại nguyên vẹn', async () => {
    const { service, prisma } = setup();

    prisma.user.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(
      service.register({ email: 'a@example.com', password: '123456' }),
    ).rejects.toBeInstanceOf(ConflictException);

    const dbDown = new Error('connection refused');
    prisma.user.create.mockRejectedValueOnce(dbDown);
    await expect(service.register({ email: 'a@example.com', password: '123456' })).rejects.toBe(
      dbDown,
    );
  });

  it('login: thành công thì ký JWT với sub, email, role', async () => {
    const { service, prisma, jwt } = setup();
    prisma.user.findUnique.mockResolvedValue({
      userId: 'u1',
      email: 'a@example.com',
      username: 'a',
      role: 'STAFF',
      loyaltyPoints: 25,
      isActive: true,
      passwordHash: await bcrypt.hash('matkhau123', 10),
    });

    const result = await service.login({ email: 'a@example.com', password: 'matkhau123' });

    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'a@example.com',
      role: 'STAFF',
    });
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).toEqual({
      id: 'u1',
      email: 'a@example.com',
      username: 'a',
      role: 'STAFF',
      loyaltyPoints: 25,
    });
  });

  it('login: sai mật khẩu hoặc không có user thì 401 và không ký token', async () => {
    const { service, prisma, jwt } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      userId: 'u1',
      email: 'a@example.com',
      username: 'a',
      role: 'CUSTOMER',
      isActive: true,
      passwordHash: await bcrypt.hash('dung-mat-khau', 10),
    });
    await expect(service.login({ email: 'a@example.com', password: 'sai' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.login({ email: 'khong@example.com', password: 'sai' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
