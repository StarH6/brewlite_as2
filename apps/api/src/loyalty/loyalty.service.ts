
import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  LoyaltyTransaction,
  LoyaltyType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);
  private readonly VND_PER_POINT = 10_000;
  private readonly MAX_TRANSACTION_RETRIES = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tính điểm thưởng: 10.000 VNĐ = 1 điểm.
   */
  private calculateEarnedPoints(totalAmount: number): number {
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return 0;
    }

    return Math.floor(totalAmount / this.VND_PER_POINT);
  }

  /**
   * Tính số điểm thực tế có thể thu hồi.
   * Không để số dư điểm bị âm.
   */
  private calculateReversalPoints(
    currentPoints: number,
    earnedPoints: number,
  ): number {
    return Math.min(currentPoints, earnedPoints);
  }

  /**
   * FR-10: Tích lũy điểm sau khi đơn hàng chuyển sang PAID.
   * Idempotent theo (orderId, EARN).
   */
  async earnPoints(
    userId: string,
    orderId: string,
    totalAmount: number,
  ): Promise<LoyaltyTransaction | null> {
    const points = this.calculateEarnedPoints(totalAmount);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.loyaltyTransaction.findUnique({
          where: {
            orderId_type: {
              orderId,
              type: LoyaltyType.EARN,
            },
          },
        });

        if (existing) {
          if (existing.userId !== userId) {
            throw new ConflictException(
              'Giao dịch tích điểm không thuộc người dùng này.',
            );
          }

          this.logger.debug(
            `Đơn hàng ${orderId} đã được cộng điểm trước đó. Bỏ qua thao tác lặp.`,
          );

          return existing;
        }

        const transaction = await tx.loyaltyTransaction.create({
          data: {
            userId,
            orderId,
            points,
            type: LoyaltyType.EARN,
          },
        });

        if (points > 0) {
          await tx.user.update({
            where: { userId },
            data: {
              loyaltyPoints: { increment: points },
            },
          });
        }

        this.logger.log(
          `Đã cộng ${points} điểm cho user ${userId}, đơn ${orderId}.`,
        );

        return transaction;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.loyaltyTransaction.findUnique({
          where: {
            orderId_type: {
              orderId,
              type: LoyaltyType.EARN,
            },
          },
        });

        if (duplicate) {
          if (duplicate.userId !== userId) {
            throw new ConflictException(
              'Giao dịch tích điểm không thuộc người dùng này.',
            );
          }

          return duplicate;
        }
      }

      this.logger.error(
        `Lỗi cộng điểm cho user ${userId}, đơn ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw error;
    }
  }

  /**
   * Hoàn điểm khi đơn hàng đã PAID bị hủy.
   * Idempotent theo (orderId, REVERSAL).
   *
   * Serializable + retry P2034:
   * tránh lost update khi nhiều đơn được hoàn điểm đồng thời.
   */
  async reversePoints(
    userId: string,
    orderId: string,
  ): Promise<LoyaltyTransaction | null> {
    for (
      let attempt = 1;
      attempt <= this.MAX_TRANSACTION_RETRIES;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const earnTx = await tx.loyaltyTransaction.findUnique({
              where: {
                orderId_type: {
                  orderId,
                  type: LoyaltyType.EARN,
                },
              },
            });

            if (!earnTx) {
              return null;
            }

            if (earnTx.userId !== userId) {
              throw new ConflictException(
                'Giao dịch tích điểm không thuộc người dùng này.',
              );
            }

            const existingReversal =
              await tx.loyaltyTransaction.findUnique({
                where: {
                  orderId_type: {
                    orderId,
                    type: LoyaltyType.REVERSAL,
                  },
                },
              });

            if (existingReversal) {
              return existingReversal;
            }

            const user = await tx.user.findUniqueOrThrow({
              where: { userId },
              select: { loyaltyPoints: true },
            });

            const pointsToReverse = this.calculateReversalPoints(
              user.loyaltyPoints,
              earnTx.points,
            );

            const reversalTx = await tx.loyaltyTransaction.create({
              data: {
                userId,
                orderId,
                points: -pointsToReverse,
                type: LoyaltyType.REVERSAL,
              },
            });

            if (pointsToReverse > 0) {
              await tx.user.update({
                where: { userId },
                data: {
                  loyaltyPoints: {
                    decrement: pointsToReverse,
                  },
                },
              });
            }

            this.logger.log(
              `Đã thu hồi ${pointsToReverse} điểm của user ${userId}, đơn ${orderId}.`,
            );

            return reversalTx;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const duplicate = await this.prisma.loyaltyTransaction.findUnique({
            where: {
              orderId_type: {
                orderId,
                type: LoyaltyType.REVERSAL,
              },
            },
          });

          if (duplicate) {
            if (duplicate.userId !== userId) {
              throw new ConflictException(
                'Giao dịch hoàn điểm không thuộc người dùng này.',
              );
            }

            return duplicate;
          }
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < this.MAX_TRANSACTION_RETRIES
        ) {
          this.logger.warn(
            `Xung đột transaction khi hoàn điểm đơn ${orderId}. Thử lại lần ${attempt + 1}.`,
          );

          continue;
        }

        this.logger.error(
          `Lỗi hoàn điểm cho user ${userId}, đơn ${orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        throw error;
      }
    }

    throw new Error(
      `Không thể hoàn điểm cho đơn ${orderId} sau nhiều lần thử.`,
    );
  }

  /**
   * Lấy số điểm tích lũy hiện tại của người dùng.
   */
  async getPoints(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { loyaltyPoints: true },
    });

    return user?.loyaltyPoints ?? 0;
  }
}
