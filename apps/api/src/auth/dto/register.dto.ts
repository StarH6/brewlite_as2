import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/**
 * FR-04: email hợp lệ, mật khẩu tối thiểu 6 ký tự.
 * Mật khẩu tối đa 72 ký tự vì bcrypt chỉ xét 72 byte đầu.
 */
export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự.' })
  email: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @MinLength(6, { message: 'Mật khẩu phải có tối thiểu 6 ký tự.' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự.' })
  password: string;

  /** Tên hiển thị (cột User.username bắt buộc). Bỏ trống thì lấy phần trước dấu @ của email. */
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Tên hiển thị phải là chuỗi ký tự.' })
  @MinLength(1, { message: 'Tên hiển thị không được để trống.' })
  @MaxLength(50, { message: 'Tên hiển thị tối đa 50 ký tự.' })
  username?: string;
}
