
import { Module } from '@nestjs/common';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { VnpayController } from './vnpay/vnpay.controller';
import { VnpayPaymentsService } from './vnpay/vnpay-payments.service';
import { VnpayService } from './vnpay/vnpay.service';

@Module({
  imports: [LoyaltyModule, OrdersModule],
  controllers: [PaymentsController, VnpayController],
  providers: [PaymentsService, VnpayService, VnpayPaymentsService],
})
export class PaymentsModule {}
