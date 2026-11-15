export function SiteFooter() {
  return (
    <footer className="border-t border-coffee-100 bg-coffee-900 text-cream/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} BrewLite. Đồ uống pha vừa gu.</p>
        <p>Pick-up tại quầy · Thanh toán không tiền mặt</p>
      </div>
    </footer>
  );
}
