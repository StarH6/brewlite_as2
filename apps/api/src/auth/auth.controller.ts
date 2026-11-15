import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedUser, LoginResponse, PublicUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  /** Route mẫu có guard: dùng để kiểm tra token. Các route đặt đơn/thanh toán sẽ dùng chung JwtAuthGuard. */
  // @Get('me')
  // @UseGuards(JwtAuthGuard)
  // me(@CurrentUser() user: AuthenticatedUser): { id: string; email: string; role: string } {
  //   return { id: user.userId, email: user.email, role: user.role };

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.getMe(user.userId);
  }
}
