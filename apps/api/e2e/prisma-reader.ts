import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '../../../.env.e2e') });

const databaseUrl = process.env.DATABASE_URL_E2E;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL_E2E');
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

// Kiểm tra kết nối DB, chỉ thực hiện truy vấn đọc.
export async function verifyDatabaseConnection() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
}

// Đọc Order cùng OrderItems, Options và Payments.
export async function findOrderByCode(orderCode: string) {
  return prisma.order.findUnique({
    where: { orderCode },
    include: {
      items: {
        include: {
          options: true,
        },
      },
      payments: true,
    },
  });
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
  