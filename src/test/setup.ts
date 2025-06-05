import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    lastError: null
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  tabs: {
    create: vi.fn()
  },
  action: {
    enable: vi.fn(),
    disable: vi.fn()
  }
} as any;