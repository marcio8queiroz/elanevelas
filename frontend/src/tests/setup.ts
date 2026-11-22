import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('HTTP externo proibido nos testes');
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
