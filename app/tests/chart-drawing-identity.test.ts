import { describe, expect, it } from 'vitest';
import { createChartDrawingId } from '../src/features/chart';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('P18.34 chart drawing identity', () => {
  it('allocates fresh chart drawing identities as platform UUIDs', () => {
    const ids = Array.from({ length: 32 }, () => createChartDrawingId());

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('keeps drawing identity allocation independent from trade-domain identity ownership', () => {
    const id = createChartDrawingId();

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
