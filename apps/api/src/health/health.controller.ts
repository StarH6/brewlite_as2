import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness: không query DB, dùng cho Render/Docker health check (FR-14).
   */
  @Get()
  liveness(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'brewlite-api',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: SELECT 1 để xác nhận API kết nối được PostgreSQL.
   */
  @Get('ready')
  async readiness(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Cơ sở dữ liệu chưa sẵn sàng.',
      });
    }
  }
}
