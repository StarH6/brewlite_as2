import { LoyaltyPolicy } from './loyalty-policy';

describe('LoyaltyPolicy', () => {
  describe('calculateEarnedPoints', () => {
    it('tính đúng điểm thưởng theo công thức floor(totalAmount / 10000)', () => {
      expect(LoyaltyPolicy.calculateEarnedPoints(10000)).toBe(1);
      expect(LoyaltyPolicy.calculateEarnedPoints(29000)).toBe(2);
      expect(LoyaltyPolicy.calculateEarnedPoints(45000)).toBe(4);
      expect(LoyaltyPolicy.calculateEarnedPoints(105000)).toBe(10);
      expect(LoyaltyPolicy.calculateEarnedPoints(259000)).toBe(25);
    });

    it('trả về 0 điểm khi số tiền nhỏ hơn 10000', () => {
      expect(LoyaltyPolicy.calculateEarnedPoints(9999)).toBe(0);
      expect(LoyaltyPolicy.calculateEarnedPoints(5000)).toBe(0);
      expect(LoyaltyPolicy.calculateEarnedPoints(0)).toBe(0);
    });

    it('trả về 0 điểm khi số tiền âm hoặc không hợp lệ', () => {
      expect(LoyaltyPolicy.calculateEarnedPoints(-50000)).toBe(0);
      expect(LoyaltyPolicy.calculateEarnedPoints(NaN)).toBe(0);
    });
  });

  describe('calculateReversalPoints', () => {
    it('trừ điểm đúng và không để số điểm âm', () => {
      expect(LoyaltyPolicy.calculateReversalPoints(10, 4)).toBe(6);
      expect(LoyaltyPolicy.calculateReversalPoints(4, 4)).toBe(0);
      expect(LoyaltyPolicy.calculateReversalPoints(2, 5)).toBe(0);
    });
  });
});
