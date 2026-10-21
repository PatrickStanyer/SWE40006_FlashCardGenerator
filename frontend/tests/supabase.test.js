import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  mocks.createClient.mockClear();
});

describe('Supabase client configuration', () => {
  it('creates a client when both required environment variables are set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

    const { supabase } = await import('../src/supabase.js');

    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-anon-key',
    );
    expect(supabase).toEqual({ auth: {} });
  });

  it('does not create a client when the required configuration is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const { supabase } = await import('../src/supabase.js');

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(supabase).toBeNull();
  });
});
