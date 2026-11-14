import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderStateMachine } from './order-state-machine';

describe('OrderStateMachine (FR-08)', () => {
  describe('assertTransition - Các chuyển đổi hợp lệ', () => {
    it('cho phép chuyển PENDING -> PAID (Thanh toán thành công)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.PAID);
      }).not.toThrow();
    });

    it('cho phép chuyển PENDING -> PAYMENT_FAILED (Thanh toán thất bại đã xác minh)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED);
      }).not.toThrow();
    });

    it('cho phép chuyển PAYMENT_FAILED -> PENDING (Khách hàng thử lại thanh toán)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING);
      }).not.toThrow();
    });

    it('cho phép chuyển PENDING -> CANCELLED (Khách hàng hủy đơn)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.CANCELLED);
      }).not.toThrow();
    });

    it('cho phép chuyển PAYMENT_FAILED -> CANCELLED (Hủy đơn khi lỗi thanh toán)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED);
      }).not.toThrow();
    });

    it('cho phép chuyển PAID -> CANCELLED (Nhân viên hủy đơn/hoàn tiền)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PAID, OrderStatus.CANCELLED);
      }).not.toThrow();
    });

    it('cho phép luồng KDS: PAID -> PREPARING -> READY -> COMPLETED', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PAID, OrderStatus.PREPARING);
        OrderStateMachine.assertTransition(OrderStatus.PREPARING, OrderStatus.READY);
        OrderStateMachine.assertTransition(OrderStatus.READY, OrderStatus.COMPLETED);
      }).not.toThrow();
    });

    it('cho phép luồng thử lại thanh toán: PENDING -> PAYMENT_FAILED -> PENDING -> PAID', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED);
        OrderStateMachine.assertTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING);
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.PAID);
      }).not.toThrow();
    });
  });

  describe('assertTransition - Các chuyển đổi bất hợp lệ (Chặn lỗi)', () => {
    it('chặn giữ nguyên trạng thái (same state) để thao tác lặp không chạy lần hai', () => {
      for (const status of Object.values(OrderStatus)) {
        expect(() => {
          OrderStateMachine.assertTransition(status, status);
        }).toThrow(BadRequestException);
      }
    });

    it('chặn hủy đơn đang PREPARING hoặc READY (thiết kế chỉ cho PAID -> CANCELLED)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PREPARING, OrderStatus.CANCELLED);
      }).toThrow(BadRequestException);

      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.READY, OrderStatus.CANCELLED);
      }).toThrow(BadRequestException);
    });

    it('chặn đi lùi: PAID -> PENDING, PREPARING -> PAID, READY -> PREPARING', () => {
      const backwards: Array<[OrderStatus, OrderStatus]> = [
        [OrderStatus.PAID, OrderStatus.PENDING],
        [OrderStatus.PREPARING, OrderStatus.PAID],
        [OrderStatus.READY, OrderStatus.PREPARING],
      ];

      for (const [from, to] of backwards) {
        expect(() => {
          OrderStateMachine.assertTransition(from, to);
        }).toThrow(BadRequestException);
      }
    });

    it('thông báo lỗi nêu rõ trạng thái nguồn và đích', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.READY);
      }).toThrow(/\[PENDING\].*\[READY\]/);
    });

    it('chặn trạng thái không thuộc enum (dữ liệu rác từ client)', () => {
      expect(() => {
        OrderStateMachine.assertTransition('FOO' as OrderStatus, OrderStatus.PAID);
      }).toThrow(BadRequestException);

      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PAID, 'FOO' as OrderStatus);
      }).toThrow(BadRequestException);

      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PAID, undefined as unknown as OrderStatus);
      }).toThrow(BadRequestException);
    });

    it('chặn chuyển từ COMPLETED sang trạng thái khác (Terminal state)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.COMPLETED, OrderStatus.PENDING);
      }).toThrow(BadRequestException);

      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.COMPLETED, OrderStatus.CANCELLED);
      }).toThrow(BadRequestException);
    });

    it('chặn chuyển từ CANCELLED sang trạng thái khác (Terminal state)', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.CANCELLED, OrderStatus.PENDING);
      }).toThrow(BadRequestException);
    });

    it('chặn nhảy cóc từ PENDING trực tiếp lên READY hoặc COMPLETED', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.READY);
      }).toThrow(BadRequestException);

      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PENDING, OrderStatus.COMPLETED);
      }).toThrow(BadRequestException);
    });

    it('chặn chuyển từ PAYMENT_FAILED trực tiếp lên PAID mà không quay về PENDING', () => {
      expect(() => {
        OrderStateMachine.assertTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.PAID);
      }).toThrow(BadRequestException);
    });
  });

  describe('Ma trận đầy đủ 7 x 7 theo thiết kế (Test (a): chặn chuyển trạng thái sai)', () => {
    // Bảng này viết độc lập với code, lấy từ docs/diagrams/class-diagram.puml
    // và docs/architecture/architecture.md. Mọi cặp không có trong bảng phải bị chặn.
    const ALLOWED: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
      [OrderStatus.PENDING, OrderStatus.PAID],
      [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED],
      [OrderStatus.PENDING, OrderStatus.CANCELLED],
      [OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING],
      [OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
      [OrderStatus.PAID, OrderStatus.PREPARING],
      [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING, OrderStatus.READY],
      [OrderStatus.READY, OrderStatus.COMPLETED],
    ];

    const statuses = Object.values(OrderStatus);
    const isAllowed = (from: OrderStatus, to: OrderStatus): boolean =>
      ALLOWED.some(([f, t]) => f === from && t === to);
    const allPairs = statuses.flatMap((from) => statuses.map((to) => [from, to] as const));

    it('enum OrderStatus có đúng 7 trạng thái (thêm trạng thái mới thì phải cập nhật bảng này)', () => {
      expect(statuses).toHaveLength(7);
      expect(allPairs).toHaveLength(49);
      expect(ALLOWED).toHaveLength(9);
    });

    it.each(allPairs)('%s -> %s', (from, to) => {
      const attempt = () => OrderStateMachine.assertTransition(from, to);

      if (isAllowed(from, to)) {
        expect(attempt).not.toThrow();
      } else {
        expect(attempt).toThrow(BadRequestException);
      }
    });
  });

  describe('isTerminal', () => {
    it('trả về true cho COMPLETED và CANCELLED', () => {
      expect(OrderStateMachine.isTerminal(OrderStatus.COMPLETED)).toBe(true);
      expect(OrderStateMachine.isTerminal(OrderStatus.CANCELLED)).toBe(true);
    });

    it('trả về false cho các trạng thái trung gian', () => {
      expect(OrderStateMachine.isTerminal(OrderStatus.PENDING)).toBe(false);
      expect(OrderStateMachine.isTerminal(OrderStatus.PAID)).toBe(false);
      expect(OrderStateMachine.isTerminal(OrderStatus.PREPARING)).toBe(false);
      expect(OrderStateMachine.isTerminal(OrderStatus.READY)).toBe(false);
    });
  });
});
