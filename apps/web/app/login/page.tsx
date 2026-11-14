'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/cart';

  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.login(email.trim(), password);
      // Lưu JWT Token và User vào Zustand store (tự động đồng bộ localStorage)
      setAuth(response.accessToken, response.user);

      setSuccessMsg('Đăng nhập thành công! Đang chuyển hướng...');

      // Chuyển hướng về giỏ hàng (hoặc trang được chỉ định) theo yêu cầu CV11
      setTimeout(() => {
        router.push(redirectTo);
      }, 500);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrorMsg('Email hoặc mật khẩu không chính xác. Vui lòng thử lại.');
        } else {
          setErrorMsg(err.message || 'Đăng nhập thất bại.');
        }
      } else {
        setErrorMsg('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-coffee-200/80 bg-white/95 p-6 shadow-card sm:p-8">
        <div className="text-center">
          <span className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-coffee-800 text-lg font-bold text-cream">
            B
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-coffee-900">
            Đăng nhập BrewLite
          </h1>
          <p className="mt-1 text-sm text-coffee-600">
            Đăng nhập để đặt món nhanh chóng và tích lũy điểm thưởng
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-2xl bg-red-50 p-3.5 text-sm font-medium text-red-700 border border-red-200"
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="mt-4 rounded-2xl bg-emerald-50 p-3.5 text-sm font-medium text-emerald-800 border border-emerald-200"
          >
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-coffee-800 uppercase tracking-wider"
            >
              Địa chỉ Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tenban@email.com"
              className="mt-1.5 block w-full rounded-2xl border border-coffee-200 bg-white px-4 py-3 text-sm text-coffee-900 placeholder:text-coffee-400 focus:border-coffee-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-coffee-800 uppercase tracking-wider"
              >
                Mật khẩu
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs text-coffee-600 hover:text-coffee-900 transition"
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              className="mt-1.5 block w-full rounded-2xl border border-coffee-200 bg-white px-4 py-3 text-sm text-coffee-900 placeholder:text-coffee-400 focus:border-coffee-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full bg-coffee-800 py-3.5 text-sm font-semibold text-cream shadow transition hover:bg-coffee-700 disabled:cursor-not-allowed disabled:bg-coffee-300"
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-coffee-600">
          Chưa có tài khoản?{' '}
          <Link
            href={`/register?redirect=${encodeURIComponent(redirectTo)}`}
            className="font-semibold text-coffee-900 underline underline-offset-4 hover:text-coffee-700"
          >
            Đăng ký ngay
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md p-8 text-center text-coffee-600">
          Đang tải trang đăng nhập...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
