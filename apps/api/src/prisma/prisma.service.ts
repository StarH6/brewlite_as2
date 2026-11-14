import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, type Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const logLevels: Prisma.LogLevel[] =
      config.get<string>('NODE_ENV') === 'development' ? ['warn', 'error'] : ['error'];

    super({
      datasourceUrl: config.getOrThrow<string>('DATABASE_URL'),
      log: logLevels,
    });
  }

  /**
   * Không $connect trong onModuleInit để GET / vẫn hoạt động khi DB chưa sẵn sàng.
   * Prisma mở connection lazy ở query đầu tiên; /health/ready kiểm tra kết nối thật.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
