import type { Product } from '@/lib/types';

/**
 * Lý do món không bán được, hiển thị cho khách.
 * Món hết vì thiếu nguyên liệu thì nêu rõ nguyên liệu nào; hết kho thường thì ghi chung.
 */
export function soldOutReason(product: Product): string {
  const missing = product.missingIngredients ?? [];
  return missing.length > 0 ? `Tạm hết nguyên liệu: ${missing.join(', ')}` : 'Tạm hết hàng';
}
