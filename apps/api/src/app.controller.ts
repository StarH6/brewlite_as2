import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class AppController {
  /**
   * Health check tối giản theo CV02: GET / trả đúng chuỗi "Hello".
   * /health và /health/ready phục vụ vận hành (FR-14).
   */
  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getHello(): string {
    return 'Hello';
  }
}
