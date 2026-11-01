import '@testing-library/jest-dom'
import { vi } from 'vitest'

// next/headers cannot be used outside a Next.js request scope in tests.
// Provide a global stub so any module that calls cookies() / headers() doesn't throw.
// Individual test files can override this with their own vi.mock('next/headers', ...).
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn().mockReturnValue(false),
  }),
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

// next/navigation redirect/notFound throw in tests without the Next.js runtime.
// Stub them so imports don't fail; individual tests can spy/override as needed.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

// Browser appearance APIs used by the adaptive UI; disable motion in DOM tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn(query => ({
    matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
