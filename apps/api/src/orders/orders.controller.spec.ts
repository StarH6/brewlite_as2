import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController (CV16 / Task 9)', () => {
  let controller: OrdersController;
  let service: OrdersService;

  const mockUser: AuthenticatedUser = {
    userId: 'user-uuid-1',
    email: 'test@brewlite.local',
    role: UserRole.CUSTOMER,
  };

  const mockOrdersService = {
    getMyOrders: jest.fn(),
    getOrderById: jest.fn(),
    createOrder: jest.fn(),
    cancelOrder: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  describe('GET /orders/me (FR-07 / CV16)', () => {
    it('gọi service.getMyOrders với userId của user đăng nhập và trả về danh sách đơn hàng', async () => {
      const mockResult = [
        {
          id: 'order-1',
          orderCode: 'BL-20261024-0001',
          userId: 'user-uuid-1',
          status: 'PENDING',
          totalAmount: 45000,
          createdAt: new Date(),
          items: [],
        },
      ];
      mockOrdersService.getMyOrders.mockResolvedValue(mockResult);

      const result = await controller.getMyOrders(mockUser);

      expect(service.getMyOrders).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toBe(mockResult);
    });
  });

  describe('GET /orders/:id (FR-07 / CV16 - Chi tiết đơn cho màn hình xác nhận)', () => {
    it('gọi service.getOrderById với đúng id, userId và role của user', async () => {
      const mockResult = {
        id: 'order-1',
        orderCode: 'BL-20261024-0001',
        userId: 'user-uuid-1',
        status: 'PENDING',
        totalAmount: 45000,
        createdAt: new Date(),
        items: [
          {
            orderItemId: 'item-1',
            productName: 'Cà phê Sữa Đá',
            quantity: 1,
            unitPrice: 45000,
            subtotal: 45000,
          },
        ],
      };
      mockOrdersService.getOrderById.mockResolvedValue(mockResult);

      const result = await controller.getById('order-1', mockUser);

      expect(service.getOrderById).toHaveBeenCalledWith(
        'order-1',
        'user-uuid-1',
        UserRole.CUSTOMER,
      );
      expect(result).toBe(mockResult);
    });
  });
});
