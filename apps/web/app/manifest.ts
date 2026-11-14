import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BrewLite – Đồ uống pha vừa gu',
    short_name: 'BrewLite',
    description: 'Đặt đồ uống mobile-first, thanh toán không tiền mặt và nhận tại quầy.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f1e8',
    theme_color: '#4b2e1f',
    lang: 'vi',
  };
}
