import { IsInt, Max, Min } from 'class-validator';

export class UpdateIngredientStockDto {
  /** Tồn kho mới của nguyên liệu (cùng đơn vị với `unit`), dùng khi nhập thêm hàng hoặc kiểm kê. */
  @IsInt({ message: 'Tồn kho phải là số nguyên.' })
  @Min(0, { message: 'Tồn kho không được âm.' })
  @Max(100_000_000, { message: 'Tồn kho quá lớn.' })
  stock!: number;
}
