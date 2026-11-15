
import { PaymentMethod } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  /**
   * Tùy chọn, chỉ để tương thích client cũ. Nguồn chính là header `Idempotency-Key`
   * (PaymentsController hợp nhất hai nguồn trước khi gọi service).
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;
}
