'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProductCard } from './product-card';

function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-coffee-100 bg-white/70 p-3">
      <div className="aspect-[4/3] animate-pulse rounded-2xl bg-coffee-100" />
      <div className="space-y-3 p-3">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-coffee-100" />
        <div className="h-3 w-full animate-pulse rounded-full bg-coffee-100" />
        <div className="h-9 w-full animate-pulse rounded-full bg-coffee-100" />
      </div>
    </div>
  );
}

export function ProductGrid() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: api.getProducts,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  if (isPending) {
    return (
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <ProductSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">
          Không tải được menu
        </p>
        <p className="mt-2 text-sm text-red-600">
          {error instanceof Error ? error.message : 'Vui lòng thử lại sau.'}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-5 rounded-full bg-coffee-800 px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-coffee-700"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const activeProducts = (data ?? []).filter(
    (product) => product.status === 'ACTIVE',
  );

  if (activeProducts.length === 0) {
    return (
      <div className="mt-8 rounded-3xl border border-dashed border-coffee-200 bg-white/60 p-10 text-center">
        <p className="text-lg font-semibold">Menu đang được cập nhật</p>
        <p className="mt-2 text-sm text-coffee-600">
          Hiện chưa có món nào đang bán. Vui lòng quay lại sau.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {activeProducts.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
