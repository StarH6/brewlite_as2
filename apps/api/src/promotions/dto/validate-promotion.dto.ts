import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class ValidatePromotionDto {
  @IsString({ message: 'Mã khuyến mãi phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã khuyến mãi không được để trống' })
  code: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Tạm tính phải là số' })
  @Min(0, { message: 'Tạm tính không thể là số âm' })
  subtotal: number;
}
