import { ProductGrid } from '@/components/product-grid';

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-coffee-900 via-coffee-800 to-coffee-600 text-cream">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-coffee-300/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
          <div>
            <h1 className="mt-4 max-w-xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Đồ uống pha đúng gu, nhận ngay tại quầy.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-cream/80">
              Chọn món, tùy chỉnh size và topping, thanh toán online. BrewLite giúp bạn đặt đơn chỉ
              trong vài bước.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#menu"
                className="rounded-full bg-cream px-6 py-3 text-sm font-semibold text-coffee-900 transition hover:bg-amber-100"
              >
                Xem menu hôm nay
              </a>
              <span className="text-sm text-cream/70">Không cần chờ đợi · Nhận tại quầy</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-coffee-900">
            <div className="col-span-2 rounded-3xl bg-cream/95 p-5 shadow-card">
              <p className="text-sm font-semibold text-coffee-500"> Gợi ý:</p>
              <p className="mt-2 text-xl font-semibold">Một ly đúng gu, một ngày trọn vị.</p>
              <p className="mt-2 text-sm leading-6 text-coffee-600">
                Cà phê phin, trà trái cây và matcha – tất cả đều có size và topping để bạn lựa chọn.
              </p>
            </div>
            <div className="rounded-3xl bg-amber-200/95 p-5">
              <p className="text-3xl font-semibold">12+</p>
              <p className="mt-1 text-sm font-medium text-coffee-700">món trong menu</p>
            </div>
          </div>
        </div>
      </section>

      <section id="menu" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6 lg:py-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-coffee-500">Menu</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Chọn món bạn thích
            </h2>
          </div>
        </div>

        <ProductGrid />
      </section>
    </>
  );
}
