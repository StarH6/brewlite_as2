'use client';

import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { soldOutReason } from '@/lib/availability';
import { MAX_ITEM_QUANTITY, useCartStore } from '@/lib/cart-store';
import { formatVnd } from '@/lib/format';
import type { Product, ProductOption } from '@/lib/types';

/**
 * Giá 1 ly = giá gốc + phụ thu size + tổng phụ thu topping.
 * Công thức giống calculateUnitPrice trong lib/cart-store.ts để giá xem trước
 * ở trang chi tiết luôn khớp với giá trong giỏ hàng (architecture.md §6.2).
 * Đây chỉ là giá tạm tính để hiển thị: server sẽ tính lại khi đặt đơn (FR-05).
 */
function calculateUnitPrice(
    product: Product,
    size: ProductOption | null,
    toppings: ProductOption[],
): number {
    return (
        product.price +
        (size?.priceAdjustment ?? 0) +
        toppings.reduce((sum, topping) => sum + topping.priceAdjustment, 0)
    );
}

function surcharge(option: ProductOption): string {
    return option.priceAdjustment > 0 ? `+${formatVnd(option.priceAdjustment)}` : 'Không phụ thu';
}

function DetailSkeleton() {
    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12" aria-busy="true">
            <div className="h-5 w-28 animate-pulse rounded-full bg-coffee-100" />
            <div className="mt-6 grid gap-8 lg:grid-cols-2">
                <div className="aspect-[4/3] animate-pulse rounded-3xl bg-coffee-100" />
                <div className="space-y-4">
                    <div className="h-8 w-2/3 animate-pulse rounded-full bg-coffee-100" />
                    <div className="h-4 w-full animate-pulse rounded-full bg-coffee-100" />
                    <div className="h-4 w-4/5 animate-pulse rounded-full bg-coffee-100" />
                    <div className="h-12 w-full animate-pulse rounded-2xl bg-coffee-100" />
                    <div className="h-12 w-full animate-pulse rounded-2xl bg-coffee-100" />
                    <div className="h-12 w-full animate-pulse rounded-full bg-coffee-100" />
                </div>
            </div>
        </div>
    );
}

function BackToMenu() {
    return (
        <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-coffee-600 transition hover:text-coffee-900"
        >
            <span aria-hidden="true">←</span> Quay lại menu
        </Link>
    );
}

function ProductDetailView({ product }: { product: Product }) {
    const addItem = useCartStore((state) => state.addItem);

    const sizes = product.options.filter((option) => option.type === 'SIZE' && option.isAvailable);
    const toppings = product.options.filter(
        (option) => option.type === 'TOPPING' && option.isAvailable,
    );

    // Component chỉ được mount khi đã có dữ liệu nên có thể khởi tạo state trực tiếp:
    // size đầu tiên (S) được chọn sẵn, topping là tùy chọn nên mặc định chưa chọn.
    const [sizeId, setSizeId] = useState<string | null>(sizes[0]?.id ?? null);
    const [toppingIds, setToppingIds] = useState<string[]>([]);
    const [quantity, setQuantity] = useState(1);
    const [added, setAdded] = useState(false);

    const soldOut = product.stock <= 0;
    const maxQuantity = Math.max(1, Math.min(MAX_ITEM_QUANTITY, product.stock));

    const selectedSize = sizes.find((size) => size.id === sizeId) ?? null;
    const selectedToppings = toppings.filter((topping) => toppingIds.includes(topping.id));
    const unitPrice = calculateUnitPrice(product, selectedSize, selectedToppings);
    const totalPrice = unitPrice * quantity;

    function chooseSize(id: string) {
        setSizeId(id);
        setAdded(false);
    }

    function toggleTopping(id: string) {
        setToppingIds((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        );
        setAdded(false);
    }

    function changeQuantity(next: number) {
        setQuantity(Math.min(maxQuantity, Math.max(1, next)));
        setAdded(false);
    }

    function handleAddToCart() {
        if (soldOut) return;
        addItem(product, selectedSize, selectedToppings, quantity);
        setAdded(true);
    }

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
            <BackToMenu />

            <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
                <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-coffee-100 shadow-card">
                    <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        priority
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        className="object-cover"
                    />
                    {soldOut ? (
                        <span className="absolute left-4 top-4 rounded-full bg-coffee-900/85 px-3 py-1 text-xs font-semibold text-cream">
                            Hết hàng
                        </span>
                    ) : null}
                </div>

                <div>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>
                    <p className="mt-2 text-sm leading-6 text-coffee-600">{product.description}</p>
                    <p className="mt-3 text-sm text-coffee-500">
                        Giá từ <span className="font-semibold text-coffee-900">{formatVnd(product.price)}</span>
                        {' · '}
                        {soldOut ? soldOutReason(product) : `Còn ${product.stock} phần`}
                    </p>

                    {sizes.length > 0 ? (
                        <fieldset className="mt-6">
                            <legend className="text-sm font-semibold">Chọn size</legend>
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                {sizes.map((size) => (
                                    <label key={size.id} className="relative cursor-pointer">
                                        <input
                                            type="radio"
                                            name="size"
                                            value={size.id}
                                            checked={size.id === sizeId}
                                            onChange={() => chooseSize(size.id)}
                                            className="peer sr-only"
                                        />
                                        <span className="block rounded-2xl border border-coffee-200 bg-white/80 px-3 py-3 text-center transition peer-checked:border-coffee-800 peer-checked:bg-coffee-800 peer-checked:text-cream peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400 peer-focus-visible:ring-offset-2">
                                            <span className="block text-base font-semibold">{size.name}</span>
                                            <span className="mt-0.5 block text-xs opacity-80">{surcharge(size)}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    ) : null}

                    {toppings.length > 0 ? (
                        <fieldset className="mt-6">
                            <legend className="text-sm font-semibold">
                                Topping <span className="font-normal text-coffee-500">(chọn nhiều, tùy ý)</span>
                            </legend>
                            <div className="mt-3 space-y-2">
                                {toppings.map((topping) => (
                                    <label key={topping.id} className="relative block cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="topping"
                                            value={topping.id}
                                            checked={toppingIds.includes(topping.id)}
                                            onChange={() => toggleTopping(topping.id)}
                                            className="peer sr-only"
                                        />
                                        <span className="flex items-center justify-between rounded-2xl border border-coffee-200 bg-white/80 px-4 py-3 text-sm transition peer-checked:border-coffee-800 peer-checked:bg-coffee-100 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400 peer-focus-visible:ring-offset-2">
                                            <span className="font-medium">{topping.name}</span>
                                            <span className="text-coffee-600">{surcharge(topping)}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    ) : null}

                    <div className="mt-6 flex items-center justify-between">
                        <span className="text-sm font-semibold">Số lượng</span>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => changeQuantity(quantity - 1)}
                                disabled={soldOut || quantity <= 1}
                                aria-label="Giảm số lượng"
                                className="grid h-10 w-10 place-items-center rounded-full border border-coffee-200 bg-white/80 text-lg font-semibold transition hover:bg-coffee-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                −
                            </button>
                            <span className="w-8 text-center text-base font-semibold" aria-live="polite">
                                {quantity}
                            </span>
                            <button
                                type="button"
                                onClick={() => changeQuantity(quantity + 1)}
                                disabled={soldOut || quantity >= maxQuantity}
                                aria-label="Tăng số lượng"
                                className="grid h-10 w-10 place-items-center rounded-full border border-coffee-200 bg-white/80 text-lg font-semibold transition hover:bg-coffee-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 rounded-3xl border border-coffee-100 bg-white/80 p-5 shadow-card">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm text-coffee-600">Tạm tính ({quantity} ly)</span>
                            <span className="text-2xl font-semibold text-coffee-900" data-testid="total-price">
                                {formatVnd(totalPrice)}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-coffee-500">
                            {formatVnd(unitPrice)} / ly. Giá cuối cùng do hệ thống tính lại khi đặt đơn.
                        </p>

                        <button
                            type="button"
                            onClick={handleAddToCart}
                            disabled={soldOut}
                            className="mt-4 w-full rounded-full bg-coffee-800 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-coffee-700 disabled:cursor-not-allowed disabled:bg-coffee-200 disabled:text-coffee-500"
                        >
                            {soldOut ? 'Hết hàng' : 'Thêm vào giỏ'}
                        </button>

                        {added ? (
                            <p
                                role="status"
                                className="mt-3 flex items-center justify-between rounded-2xl bg-amber-100 px-4 py-2.5 text-sm text-coffee-800"
                            >
                                <span>Đã thêm vào giỏ hàng.</span>
                                <Link href="/cart" className="font-semibold underline underline-offset-2">
                                    Xem giỏ hàng
                                </Link>
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ProductDetail({ productId }: { productId: string }) {
    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['product', productId],
        queryFn: () => api.getProduct(productId),
        staleTime: 0,
        refetchOnWindowFocus: true,
        // Món không tồn tại (404/400) thì thử lại cũng vô ích.
        retry: (failureCount, err) =>
            !(err instanceof ApiError && (err.status === 404 || err.status === 400)) && failureCount < 1,
    });

    if (isPending) {
        return <DetailSkeleton />;
    }

    if (isError) {
        const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);

        return (
            <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
                <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
                    <p className="text-sm font-semibold text-red-700">
                        {notFound ? 'Không tìm thấy món này' : 'Không tải được chi tiết món'}
                    </p>
                    <p className="mt-2 text-sm text-red-600">
                        {notFound
                            ? 'Món có thể đã ngừng bán hoặc đường dẫn không đúng.'
                            : error instanceof Error
                                ? error.message
                                : 'Vui lòng thử lại sau.'}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                        {notFound ? null : (
                            <button
                                type="button"
                                onClick={() => {
                                    void refetch();
                                }}
                                className="rounded-full bg-coffee-800 px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-coffee-700"
                            >
                                Thử lại
                            </button>
                        )}
                        <Link
                            href="/"
                            className="rounded-full border border-coffee-200 px-5 py-2.5 text-sm font-semibold text-coffee-800 transition hover:bg-coffee-100"
                        >
                            Về menu
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return <ProductDetailView product={data} />;
}
