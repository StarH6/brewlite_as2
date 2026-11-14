import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

function normalizeEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự.' })
  email: string;

  // Không kiểm tra độ dài tối thiểu ở đây: mật khẩu sai luôn trả 401, không tiết lộ quy tắc.
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu.' })
  @MaxLength(128, { message: 'Mật khẩu quá dài.' })
  password: string;
}
