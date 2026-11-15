import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * FR-05: API Tạo đơn hàng mới từ giỏ hàng.
   * Yêu cầu xác thực JWT (CV08/CV11).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user.userId, dto);
  }

  /**
   * FR-07: Xem danh sách các đơn hàng của người dùng hiện tại.
   */
  @Get('me')
  async getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getMyOrders(user.userId);
  }

  /**
   * Xem chi tiết một đơn hàng theo ID.
   */
  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.getOrderById(id, user.userId, user.role);
  }

  /**
   * Hủy một đơn hàng đang ở trạng thái PENDING.
   */
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.cancelOrder(id, user.userId, user.role);
  }

  /**
   * Cập nhật trạng thái đơn hàng (Dành riêng cho nhân viên/STAFF).
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') nextStatus: OrderStatus,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.STAFF) {
      throw new ForbiddenException(
        'Chỉ nhân viên (STAFF) mới có quyền cập nhật trạng thái đơn hàng.',
      );
    }
    return this.ordersService.updateStatus(id, nextStatus);
  }
}
