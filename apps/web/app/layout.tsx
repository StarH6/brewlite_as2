import type { Metadata, Viewport } from 'next';
import "./globals.css";
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'BrewLite – Đồ uống pha vừa gu',
    template: '%s | BrewLite',
  },
  description:
    'BrewLite – đặt đồ uống mobile-first, chọn size/topping, thanh toán không tiền mặt và nhận tại quầy.',
  applicationName: 'BrewLite',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4b2e1f',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
