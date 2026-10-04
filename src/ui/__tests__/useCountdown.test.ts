import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCountdown } from '../useCountdown';

describe('useCountdown', () => {
  it('returns the fresh value on the first render after endsAt changes (no stale 0 → no false finish)', () => {
    const { result, rerender } = renderHook(({ e }) => useCountdown(e), { initialProps: { e: null as number | null } });
    expect(result.current).toBe(0);
    rerender({ e: Date.now() + 10_000 });
    expect(result.current).toBe(10);
    rerender({ e: Date.now() + 90_500 });
    expect(result.current).toBe(91);
    rerender({ e: null });
    expect(result.current).toBe(0);
  });
});
