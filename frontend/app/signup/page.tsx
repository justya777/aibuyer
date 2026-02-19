'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantName }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      setIsLoading(false);
      setError(payload?.error || 'Signup failed.');
      return;
    }

    const login = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setIsLoading(false);
    if (login?.ok) {
      router.push('/');
      router.refresh();
      return;
    }

    setError('Account created, but login failed. Please sign in manually.');
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Create account</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workspace name</label>
            <input
              type="text"
              value={tenantName}
              onChange={(event) => setTenantName(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Optional"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-facebook-600 text-white rounded-md px-4 py-2 hover:bg-facebook-700 disabled:opacity-50"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <a className="text-facebook-600 hover:text-facebook-700" href="/login">
              Sign in
            </a>
          </p>
        </div>
      </form>
    </main>
  );
}
