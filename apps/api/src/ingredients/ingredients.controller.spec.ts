import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';

describe('IngredientsController: chỉ nhân viên được quản lý nguyên liệu', () => {
  let controller: IngredientsController;
  const service = { findAll: jest.fn(), setStock: jest.fn() };

  const staff = { userId: 'u1', email: 's@brewlite.vn', role: UserRole.STAFF };
  const customer = { userId: 'u2', email: 'c@brewlite.vn', role: UserRole.CUSTOMER };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [IngredientsController],
      providers: [{ provide: IngredientsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(IngredientsController);
  });

  it('khách hàng bị chặn 403 khi xem kho', () => {
    expect(() => controller.findAll(customer)).toThrow(ForbiddenException);
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('khách hàng bị chặn 403 khi sửa tồn kho', () => {
    expect(() => controller.setStock('id', { stock: 10 }, customer)).toThrow(ForbiddenException);
    expect(service.setStock).not.toHaveBeenCalled();
  });

  it('nhân viên xem được kho và nhập thêm hàng', async () => {
    service.findAll.mockResolvedValue([]);
    service.setStock.mockResolvedValue({ id: 'id', stock: 500 });

    await controller.findAll(staff);
    await controller.setStock('id', { stock: 500 }, staff);

    expect(service.findAll).toHaveBeenCalledTimes(1);
    expect(service.setStock).toHaveBeenCalledWith('id', 500);
  });
});
