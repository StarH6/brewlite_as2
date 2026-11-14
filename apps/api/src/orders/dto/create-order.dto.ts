import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @IsUUID('all', { message: 'Mã sản phẩm productId phải là UUID hợp lệ' })
  productId: string;

  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  @Max(20, { message: 'Số lượng tối đa cho mỗi món là 20' })
  quantity: number;

  @IsOptional()
  @IsUUID('all', { message: 'Mã tùy chọn size phải là UUID hợp lệ' })
  sizeOptionId?: string;

  @IsOptional()
  @IsArray({ message: 'toppingOptionIds phải là danh sách UUID' })
  @IsUUID('all', { each: true, message: 'Mỗi mã topping phải là UUID hợp lệ' })
  toppingOptionIds?: string[];
}

export class CreateOrderDto {
  @IsArray({ message: 'Danh sách món items phải là một mảng' })
  @ArrayNotEmpty({ message: 'Giỏ hàng không được để trống' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsString({ message: 'Mã khuyến mãi phải là chuỗi' })
  promoCode?: string;
}
