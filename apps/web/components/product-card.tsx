import Image from 'next/image';
import Link from 'next/link';
import { soldOutReason } from '@/lib/availability';
import { formatVnd } from '@/lib/format';
import type { Product } from '@/lib/types';

export function ProductCard({ product }: { product: Product }) {
  const soldOut = product.stock <= 0;

  return (
    <article className="group overflow-hidden rounded-3xl border border-coffee-100 bg-white/80 p-3 shadow-card">
      <Link
        href={`/products/${product.id}`}
        className="relative block aspect-[4/3] overflow-hidden rounded-2xl bg-coffee-100"
        aria-label={`Xem chi tiết ${product.name}`}
      >
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        {soldOut ? (
          <span className="absolute left-3 top-3 rounded-full bg-coffee-900/85 px-3 py-1 text-xs font-semibold text-cream">
            Hết hàng
          </span>
        ) : null}
      </Link>

      <div className="p-3">
        <h3 className="text-base font-semibold leading-snug">
          <Link href={`/products/${product.id}`} className="hover:text-coffee-600">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 text-coffee-600">
          {product.description}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-coffee-900">{formatVnd(product.price)}</p>
            <p className="text-xs text-coffee-500">
              {soldOut ? soldOutReason(product) : `Còn ${product.stock} phần`}
            </p>
          </div>
          {soldOut ? (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-full bg-coffee-200 px-5 py-2 text-sm font-semibold text-coffee-500"
            >
              Hết hàng
            </button>
          ) : (
            <Link
              href={`/products/${product.id}`}
              aria-label={`Mua ${product.name}`}
              className="rounded-full bg-coffee-800 px-5 py-2 text-sm font-semibold text-cream transition hover:bg-coffee-700"
            >
              Mua
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
