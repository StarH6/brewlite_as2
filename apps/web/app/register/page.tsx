'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/cart';

  const setAuth = useAuthStore((state) => state.setAuth);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (password.length < 6) {
      setErrorMsg('Mật khẩu phải có độ dài tối thiểu 6 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.register(email.trim(), password, username.trim() || undefined);

      // Lưu JWT Token và User vào Zustand store (tự động đồng bộ localStorage)
      setAuth(response.accessToken, response.user);

      setSuccessMsg('Đăng ký tài khoản thành công! Đang chuyển hướng...');

      // Chuyển hướng về giỏ hàng (hoặc trang trước đó) theo yêu cầu CV11
      setTimeout(() => {
        router.push(redirectTo);
      }, 500);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.message?.includes('đã tồn tại')) {
          setErrorMsg('Email này đã được sử dụng. Vui lòng chọn email khác hoặc đăng nhập.');
        } else {
          setErrorMsg(err.message || 'Đăng ký không thành công.');
        }
      } else {
        setErrorMsg('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
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
            Tạo tài khoản BrewLite
          </h1>
          <p className="mt-1 text-sm text-coffee-600">
            Trở thành thành viên để tích lũy điểm và nhận ưu đãi độc quyền
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
              htmlFor="username"
              className="block text-xs font-semibold text-coffee-800 uppercase tracking-wider"
            >
              Họ và tên
            </label>
            <input
              id="username"
              type="text"
              autoComplete="name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="mt-1.5 block w-full rounded-2xl border border-coffee-200 bg-white px-4 py-3 text-sm text-coffee-900 placeholder:text-coffee-400 focus:border-coffee-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-coffee-800 uppercase tracking-wider"
            >
              Địa chỉ Email <span className="text-red-500">*</span>
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
                Mật khẩu <span className="text-red-500">*</span>
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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              className="mt-1.5 block w-full rounded-2xl border border-coffee-200 bg-white px-4 py-3 text-sm text-coffee-900 placeholder:text-coffee-400 focus:border-coffee-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-semibold text-coffee-800 uppercase tracking-wider"
            >
              Xác nhận mật khẩu <span className="text-red-500">*</span>
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              className="mt-1.5 block w-full rounded-2xl border border-coffee-200 bg-white px-4 py-3 text-sm text-coffee-900 placeholder:text-coffee-400 focus:border-coffee-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full bg-coffee-800 py-3.5 text-sm font-semibold text-cream shadow transition hover:bg-coffee-700 disabled:cursor-not-allowed disabled:bg-coffee-300"
          >
            {loading ? 'Đang tạo tài khoản...' : 'Đăng ký ngay'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-coffee-600">
          Đã có tài khoản?{' '}
          <Link
            href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
            className="font-semibold text-coffee-900 underline underline-offset-4 hover:text-coffee-700"
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md p-8 text-center text-coffee-600">
          Đang tải trang đăng ký...
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
