
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LoyaltyType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService', () => {
  let service: LoyaltyService;
  let prisma: any;

  const createPrismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(
      'Prisma transaction error',
      {
        code,
        clientVersion: '6.0.0',
      },
    );

  const createEarnTx = (
    overrides: Record<string, unknown> = {},
  ) => ({
    transactionId: 'tx-earn',
    userId: 'user-1',
    orderId: 'order-1',
    points: 5,
    type: LoyaltyType.EARN,
    createdAt: new Date(),
    ...overrides,
  });

  const createReversalTx = (
    overrides: Record<string, unknown> = {},
  ) => ({
    transactionId: 'tx-reversal',
    userId: 'user-1',
    orderId: 'order-1',
    points: -5,
    type: LoyaltyType.REVERSAL,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (callback) => callback(prisma)),
      loyaltyTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
  });

  describe('earnPoints', () => {
    it('cộng điểm chính xác cho đơn hàng và ghi transaction (FR-10)', async () => {
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);
      prisma.loyaltyTransaction.create.mockResolvedValue(
        createEarnTx({
          points: 4,
        }),
      );
      prisma.user.update.mockResolvedValue({
        userId: 'user-1',
        loyaltyPoints: 4,
      });

      const result = await service.earnPoints(
        'user-1',
        'order-1',
        45000,
      );

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          orderId: 'order-1',
          points: 4,
          type: LoyaltyType.EARN,
        },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
        },
        data: {
          loyaltyPoints: {
            increment: 4,
          },
        },
      });

      expect(result?.points).toBe(4);
    });

    it('không cộng điểm lặp lại nếu đơn hàng đã từng được tích điểm', async () => {
      const existingTx = createEarnTx({
        points: 4,
      });

      prisma.loyaltyTransaction.findUnique.mockResolvedValue(existingTx);

      const result = await service.earnPoints(
        'user-1',
        'order-1',
        45000,
      );

      expect(result).toBe(existingTx);
      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('xử lý an toàn khi xảy ra race condition trùng khóa P2002', async () => {
      const duplicate = createEarnTx({
        transactionId: 'tx-race',
        points: 4,
      });

      prisma.$transaction.mockRejectedValueOnce(
        createPrismaError('P2002'),
      );

      prisma.loyaltyTransaction.findUnique.mockResolvedValue(duplicate);

      const result = await service.earnPoints(
        'user-1',
        'order-1',
        45000,
      );

      expect(result).toBe(duplicate);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('không tăng user points khi đơn hàng không đủ tiền tích điểm', async () => {
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);
      prisma.loyaltyTransaction.create.mockResolvedValue(
        createEarnTx({
          points: 0,
        }),
      );

      const result = await service.earnPoints(
        'user-1',
        'order-1',
        8000,
      );

      expect(result?.points).toBe(0);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('không trả về giao dịch EARN thuộc người dùng khác', async () => {
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(
        createEarnTx({
          userId: 'user-2',
        }),
      );

      await expect(
        service.earnPoints('user-1', 'order-1', 45000),
      ).rejects.toThrow(ConflictException);

      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('reversePoints', () => {
    it('trừ điểm khi đơn hàng bị hủy sau khi đã thanh toán', async () => {
      const earnTx = createEarnTx();

      prisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce(earnTx)
        .mockResolvedValueOnce(null);

      prisma.user.findUniqueOrThrow.mockResolvedValue({
        loyaltyPoints: 10,
      });

      prisma.loyaltyTransaction.create.mockResolvedValue(
        createReversalTx(),
      );

      const result = await service.reversePoints(
        'user-1',
        'order-1',
      );

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          orderId: 'order-1',
          points: -5,
          type: LoyaltyType.REVERSAL,
        },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
        },
        data: {
          loyaltyPoints: {
            decrement: 5,
          },
        },
      });

      expect(result?.type).toBe(LoyaltyType.REVERSAL);
    });

    it('không làm gì nếu đơn hàng chưa từng được tích điểm', async () => {
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);

      const result = await service.reversePoints(
        'user-1',
        'order-no-earn',
      );

      expect(result).toBeNull();
      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('không trừ điểm lặp lại nếu đã có REVERSAL trước đó', async () => {
      const earnTx = createEarnTx();
      const existingRev = createReversalTx();

      prisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce(earnTx)
        .mockResolvedValueOnce(existingRev);

      const result = await service.reversePoints(
        'user-1',
        'order-1',
      );

      expect(result).toBe(existingRev);
      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('chỉ thu hồi số điểm còn lại nếu user không đủ điểm', async () => {
      const earnTx = createEarnTx({
        points: 50,
      });

      prisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce(earnTx)
        .mockResolvedValueOnce(null);

      prisma.user.findUniqueOrThrow.mockResolvedValue({
        loyaltyPoints: 20,
      });

      prisma.loyaltyTransaction.create.mockResolvedValue(
        createReversalTx({
          points: -20,
        }),
      );

      const result = await service.reversePoints(
        'user-1',
        'order-1',
      );

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          orderId: 'order-1',
          points: -20,
          type: LoyaltyType.REVERSAL,
        },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
        },
        data: {
          loyaltyPoints: {
            decrement: 20,
          },
        },
      });

      expect(result?.points).toBe(-20);
    });

    it('không tạo REVERSAL nếu giao dịch EARN thuộc người dùng khác', async () => {
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(
        createEarnTx({
          userId: 'user-2',
        }),
      );

      await expect(
        service.reversePoints('user-1', 'order-1'),
      ).rejects.toThrow(ConflictException);

      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('xử lý an toàn khi hai request cùng hoàn điểm và gặp P2002', async () => {
      const existingRev = createReversalTx();

      prisma.$transaction.mockRejectedValueOnce(
        createPrismaError('P2002'),
      );

      prisma.loyaltyTransaction.findUnique.mockResolvedValue(existingRev);

      const result = await service.reversePoints(
        'user-1',
        'order-1',
      );

      expect(result).toBe(existingRev);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('retry transaction khi gặp lỗi P2034', async () => {
      const earnTx = createEarnTx();

      prisma.$transaction.mockRejectedValueOnce(
        createPrismaError('P2034'),
      );

      prisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce(earnTx)
        .mockResolvedValueOnce(null);

      prisma.user.findUniqueOrThrow.mockResolvedValue({
        loyaltyPoints: 10,
      });

      prisma.loyaltyTransaction.create.mockResolvedValue(
        createReversalTx(),
      );

      const result = await service.reversePoints(
        'user-1',
        'order-1',
      );

      expect(result?.type).toBe(LoyaltyType.REVERSAL);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('sử dụng Serializable isolation khi hoàn điểm', async () => {
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);

      await service.reversePoints('user-1', 'order-1');

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });
  });

  describe('getPoints', () => {
    it('lấy số điểm tích lũy hiện tại của user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        loyaltyPoints: 12,
      });

      const points = await service.getPoints('user-1');

      expect(points).toBe(12);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
        },
        select: {
          loyaltyPoints: true,
        },
      });
    });

    it('trả về 0 nếu user không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const points = await service.getPoints('user-unknown');

      expect(points).toBe(0);
    });
  });
});
