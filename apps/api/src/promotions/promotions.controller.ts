import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ValidatePromotionDto } from './dto/validate-promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  /**
   * API kiểm tra mã khuyến mãi và tính số tiền giảm dự kiến cho đơn hàng.
   * Không yêu cầu JWT để người dùng có thể xem trước giảm giá ngay tại giỏ hàng / checkout.
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() dto: ValidatePromotionDto) {
    return this.promotionsService.validatePromotion(dto.code, dto.subtotal);
  }
}
