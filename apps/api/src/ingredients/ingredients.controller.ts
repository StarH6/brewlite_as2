import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateIngredientStockDto } from './dto/update-ingredient-stock.dto';
import { IngredientsService, type IngredientResponse } from './ingredients.service';

/** Quản lý nguyên liệu: chỉ nhân viên (STAFF). */
@Controller('ingredients')
@UseGuards(JwtAuthGuard)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<IngredientResponse[]> {
    IngredientsController.assertStaff(user);
    return this.ingredientsService.findAll();
  }

  @Patch(':id/stock')
  setStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IngredientResponse> {
    IngredientsController.assertStaff(user);
    return this.ingredientsService.setStock(id, dto.stock);
  }

  private static assertStaff(user: AuthenticatedUser): void {
    if (user.role !== UserRole.STAFF) {
      throw new ForbiddenException('Chỉ nhân viên (STAFF) mới có quyền quản lý nguyên liệu.');
    }
  }
}
