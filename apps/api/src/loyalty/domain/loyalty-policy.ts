/**
 * LoyaltyPolicy — Quy tắc nghiệp vụ tính điểm thưởng cho thành viên (FR-10).
 * Tách biệt thuần túy khỏi I/O và framework NestJS.
 */
export class LoyaltyPolicy {
  public static readonly SPEND_PER_POINT = 10000;

  /**
   * Tính số điểm thưởng nhận được từ tổng số tiền thanh toán của đơn hàng.
   * Quy tắc: cộng floor(totalAmount / 10000) điểm (docs/architecture §8.4).
   * Ví dụ:
   * - 29,000 đ -> 2 điểm
   * - 45,000 đ -> 4 điểm
   * - 105,000 đ -> 10 điểm
   * - 9,999 đ -> 0 điểm
   */
  public static calculateEarnedPoints(totalAmount: number): number {
    if (totalAmount <= 0 || isNaN(totalAmount)) {
      return 0;
    }
    return Math.floor(totalAmount / LoyaltyPolicy.SPEND_PER_POINT);
  }

  /**
   * Đảm bảo số điểm loyalty của người dùng không bao giờ bị âm khi hoàn điểm (REVERSAL).
   */
  public static calculateReversalPoints(
    currentPoints: number,
    earnedPointsToReverse: number,
  ): number {
    return Math.max(0, currentPoints - earnedPointsToReverse);
  }
}
