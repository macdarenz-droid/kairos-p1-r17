import { describe, expect, it, vi } from 'vitest';
import { projectLightweightChartsV5DrawingAnchor } from '../src/features/chart';

describe('P18.25R1 Lightweight Charts v5 drawing anchor projection', () => {
  it('projects provider event time and y-coordinate price into one Kairos drawing anchor', () => {
    const coordinateToPrice = vi.fn(() => 123.45);

    expect(projectLightweightChartsV5DrawingAnchor(
      { time: 1_710_000_000, point: { x: 25, y: 80 } },
      { coordinateToPrice },
    )).toEqual({
      timestamp: '2024-03-09T16:00:00.000Z',
      price: '123.45',
    });
    expect(coordinateToPrice).toHaveBeenCalledTimes(1);
    expect(coordinateToPrice).toHaveBeenCalledWith(80);
  });

  it('normalizes provider numeric price without leaking exponential notation into DecimalString', () => {
    expect(projectLightweightChartsV5DrawingAnchor(
      { time: 1_710_000_000, point: { x: 10, y: 20 } },
      { coordinateToPrice: () => 1e-7 },
    )).toEqual({
      timestamp: '2024-03-09T16:00:00.000Z',
      price: '0.0000001',
    });

    expect(projectLightweightChartsV5DrawingAnchor(
      { time: 1_710_000_000, point: { x: 10, y: 20 } },
      { coordinateToPrice: () => 1e21 },
    )).toEqual({
      timestamp: '2024-03-09T16:00:00.000Z',
      price: '1000000000000000000000',
    });
  });

  it('fails closed when provider event time, point, or price is unavailable', () => {
    const series = { coordinateToPrice: () => 10 };
    expect(projectLightweightChartsV5DrawingAnchor({ point: { x: 1, y: 2 } }, series)).toBeNull();
    expect(projectLightweightChartsV5DrawingAnchor({ time: 1_710_000_000 }, series)).toBeNull();
    expect(projectLightweightChartsV5DrawingAnchor(
      { time: 1_710_000_000, point: { x: 1, y: 2 } },
      { coordinateToPrice: () => null },
    )).toBeNull();
  });

  it('fails closed for non-finite provider values', () => {
    expect(projectLightweightChartsV5DrawingAnchor(
      { time: Number.NaN, point: { x: 1, y: 2 } },
      { coordinateToPrice: () => 10 },
    )).toBeNull();
    expect(projectLightweightChartsV5DrawingAnchor(
      { time: 1_710_000_000, point: { x: 1, y: 2 } },
      { coordinateToPrice: () => Number.POSITIVE_INFINITY },
    )).toBeNull();
  });
});
