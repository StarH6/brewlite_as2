import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { ProductResponse } from './product-response';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<ProductResponse[]> {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.productsService.findOne(id);
  }
}
