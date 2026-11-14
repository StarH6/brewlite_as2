import { Global, Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from './auth.module';

const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

type UserRow = {
  userId: string;
  email: string;
  username: string;
  passwordHash: string;
  role: 'CUSTOMER' | 'STAFF';
  isActive: boolean;
  loyaltyPoints: number;
};

/** DB giả trong bộ nhớ: chỉ hiện thực đúng những lệnh Prisma mà module Auth dùng. */
class FakeUserStore {
  readonly rows = new Map<string, UserRow>();

  private pick(row: UserRow, select?: Record<string, boolean>): Partial<UserRow> {
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, on]) => on)
        .map(([key]) => [key, row[key as keyof UserRow]]),
    );
  }

  user = {
    create: ({
      data,
      select,
    }: {
      data: Pick<UserRow, 'email' | 'username' | 'passwordHash'>;
      select?: Record<string, boolean>;
    }) => {
      if ([...this.rows.values()].some((row) => row.email === data.email)) {
        // Giống lỗi vi phạm unique index của Prisma.
        return Promise.reject(
          Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
        );
      }
      const row: UserRow = {
        userId: randomUUID(),
        role: 'CUSTOMER',
        isActive: true,
        loyaltyPoints: 0,
        ...data,
      };
      this.rows.set(row.userId, row);
      return Promise.resolve(this.pick(row, select));
    },
    findUnique: ({
      where,
      select,
    }: {
      where: { email?: string; userId?: string };
      select?: Record<string, boolean>;
    }) => {
      const row = where.email
        ? [...this.rows.values()].find((candidate) => candidate.email === where.email)
        : this.rows.get(where.userId ?? '');
      return Promise.resolve(row ? this.pick(row, select) : null);
    },
  };
}

describe('Auth API (FR-04, NFR-02)', () => {
  let app: INestApplication;
  let store: FakeUserStore;
  let jwt: JwtService;

  beforeAll(async () => {
    store = new FakeUserStore();

    @Global()
    @Module({
      providers: [{ provide: PrismaService, useValue: store }],
      exports: [PrismaService],
    })
    class FakePrismaModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, JWT_EXPIRES_IN: '1h' })],
        }),
        FakePrismaModule,
        AuthModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Cấu hình giống apps/api/src/main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.rows.clear();
  });

  const http = () => request(app.getHttpServer());
  const register = (body: Record<string, unknown>) => http().post('/auth/register').send(body);
  const login = (body: Record<string, unknown>) => http().post('/auth/login').send(body);

  describe('POST /auth/register', () => {
    it('đăng ký thành công: 201, không trả mật khẩu hay hash', async () => {
      const res = await register({
        email: 'hieu@example.com',
        password: 'matkhau123',
        username: 'Hiếu',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        email: 'hieu@example.com',
        username: 'Hiếu',
        role: 'CUSTOMER',
        loyaltyPoints: 0,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });

    it('mật khẩu được băm bằng bcrypt (không lưu plaintext, salt rounds >= 10)', async () => {
      await register({ email: 'hieu@example.com', password: 'matkhau123' });

      const [row] = [...store.rows.values()];
      expect(row.passwordHash).not.toBe('matkhau123');
      expect(row.passwordHash).toMatch(/^\$2[aby]\$(1\d|[2-9]\d)\$/);
      expect(await bcrypt.compare('matkhau123', row.passwordHash)).toBe(true);
    });

    it('chuẩn hoá email (chữ thường, bỏ khoảng trắng) và tự đặt username từ email', async () => {
      const res = await register({ email: '  Hieu.Nguyen@Example.COM ', password: 'matkhau123' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('hieu.nguyen@example.com');
      expect(res.body.username).toBe('hieu.nguyen');
    });

    it('email trùng trả 409 (kể cả khác chữ hoa/thường)', async () => {
      await register({ email: 'hieu@example.com', password: 'matkhau123' }).expect(201);

      const res = await register({ email: 'HIEU@example.com', password: 'matkhau456' });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        path: '/auth/register',
      });
      expect(store.rows.size).toBe(1);
    });

    it.each([
      ['email sai định dạng', { email: 'khong-phai-email', password: 'matkhau123' }],
      ['thiếu email', { password: 'matkhau123' }],
      ['mật khẩu 5 ký tự (< 6)', { email: 'a@example.com', password: '12345' }],
      ['thiếu mật khẩu', { email: 'a@example.com' }],
      ['mật khẩu quá dài (> 72)', { email: 'a@example.com', password: 'x'.repeat(73) }],
      [
        'có trường lạ (role) để tự cấp quyền',
        { email: 'a@example.com', password: 'matkhau123', role: 'STAFF' },
      ],
    ])('%s trả 400 và không tạo tài khoản', async (_name, body) => {
      const res = await register(body);

      expect(res.status).toBe(400);
      expect(res.body.statusCode).toBe(400);
      expect(store.rows.size).toBe(0);
    });

    it('mật khẩu đúng 6 ký tự được chấp nhận', async () => {
      await register({ email: 'a@example.com', password: '123456' }).expect(201);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register({ email: 'hieu@example.com', password: 'matkhau123' }).expect(201);
    });

    it('đúng thông tin: 200 và phát JWT chứa userId, email, role, hạn khoảng 1 giờ', async () => {
      const res = await login({ email: 'Hieu@Example.com', password: 'matkhau123' });

      expect(res.status).toBe(200);
      expect(res.body.tokenType).toBe('Bearer');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);

      const claims = jwt.decode(res.body.accessToken) as Record<string, unknown>;
      expect(claims).toMatchObject({
        sub: res.body.user.id,
        email: 'hieu@example.com',
        role: 'CUSTOMER',
      });
      expect((claims.exp as number) - (claims.iat as number)).toBe(3600);
    });

    it('sai mật khẩu trả 401', async () => {
      const res = await login({ email: 'hieu@example.com', password: 'sai-mat-khau' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      expect(res.body.accessToken).toBeUndefined();
    });

    it('email không tồn tại trả 401 cùng thông báo (không lộ email nào đã đăng ký)', async () => {
      const wrongPassword = await login({ email: 'hieu@example.com', password: 'sai-mat-khau' });
      const unknownEmail = await login({ email: 'khong-co@example.com', password: 'matkhau123' });

      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
      expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
    });

    it('tài khoản bị khóa (isActive = false) không đăng nhập được', async () => {
      [...store.rows.values()][0].isActive = false;

      const res = await login({ email: 'hieu@example.com', password: 'matkhau123' });

      expect(res.status).toBe(401);
    });

    it('thiếu email hoặc mật khẩu trả 400', async () => {
      await login({ email: 'hieu@example.com' }).expect(400);
      await login({ password: 'matkhau123' }).expect(400);
    });
  });

  describe('JwtAuthGuard (GET /auth/me)', () => {
    let token: string;
    let userId: string;

    beforeEach(async () => {
      await register({ email: 'hieu@example.com', password: 'matkhau123' }).expect(201);
      const res = await login({ email: 'hieu@example.com', password: 'matkhau123' }).expect(200);
      token = res.body.accessToken;
      userId = res.body.user.id;
    });

    const me = (authorization?: string) => {
      const req = http().get('/auth/me');
      return authorization ? req.set('Authorization', authorization) : req;
    };

    it('không có token trả 401 theo định dạng lỗi chung', async () => {
      const res = await me();

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', path: '/auth/me' });
      expect(res.body.timestamp).toEqual(expect.any(String));
    });

    it('token hợp lệ trả 200, đúng người dùng và điểm mới nhất từ DB', async () => {
      store.rows.get(userId)!.loyaltyPoints = 25;

      const res = await me(`Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: userId,
        email: 'hieu@example.com',
        username: 'hieu',
        role: 'CUSTOMER',
        loyaltyPoints: 25,
      });
    });

    it.each([
      ['token rác', 'Bearer abc.def.ghi'],
      ['sai kiểu Authorization (Basic)', 'Basic dXNlcjpwYXNz'],
      ['thiếu chữ Bearer', 'khong-co-bearer'],
    ])('%s trả 401', async (_name, header) => {
      await me(header).expect(401);
    });

    it('token ký bằng secret khác (giả mạo) trả 401', async () => {
      const forged = await new JwtService({
        secret: 'secret-gia-mao-secret-gia-mao-123456',
      }).signAsync({
        sub: userId,
        email: 'hieu@example.com',
        role: 'STAFF',
      });

      await me(`Bearer ${forged}`).expect(401);
    });

    it('token đã hết hạn trả 401', async () => {
      const expired = await jwt.signAsync(
        { sub: userId, email: 'hieu@example.com', role: 'CUSTOMER' },
        { expiresIn: -10 },
      );

      await me(`Bearer ${expired}`).expect(401);
    });

    it('role lấy từ DB, không tin role ghi trong token', async () => {
      const staffClaim = await jwt.signAsync({
        sub: userId,
        email: 'hieu@example.com',
        role: 'STAFF',
      });

      const res = await me(`Bearer ${staffClaim}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('CUSTOMER');
    });

    it('tài khoản bị khóa hoặc đã xóa thì token cũ bị chặn ngay', async () => {
      store.rows.get(userId)!.isActive = false;
      await me(`Bearer ${token}`).expect(401);

      store.rows.delete(userId);
      await me(`Bearer ${token}`).expect(401);
    });
  });
});
