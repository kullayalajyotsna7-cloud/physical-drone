import { calculate, clampValue } from './model.js';

export const BATTERY_CAPACITY_WH = 22.2 * 5.2;
export const BENCHMARK_DURATION_MINUTES = 12;

/**
 * Deterministic synthetic discharge comparison. The simulated curve integrates
 * a gently varying load around the current modelled power. The reference curve
 * is the independent constant-power energy-balance solution at that power.
 * This is a model check, not measured aircraft data.
 */
export function createBatteryBenchmark(state, durationMinutes = BENCHMARK_DURATION_MINUTES) {
  const duration = Math.max(1, Math.floor(durationMinutes));
  const packHealth = clampValue(state.batteryHealth ?? 100, 35, 100) / 100;
  const effectiveCapacityWh = BATTERY_CAPACITY_WH * packHealth;
  const basePowerW = calculate(state).power;
  const initialSoc = clampValue(state.battery, 0, 100);
  let simulatedUsedWh = 0;
  const points = [];

  for (let minute = 0; minute <= duration; minute += 1) {
    if (minute > 0) {
      // Synthetic load variation represents changing maneuver demand; it is
      // deterministic so the demo and tests are repeatable.
      const loadFactor = 1 + 0.08 * Math.sin(minute * 0.63) + 0.035 * Math.cos(minute * 0.31);
      simulatedUsedWh += basePowerW * loadFactor / 60;
    }
    const expectedUsedWh = basePowerW * minute / 60;
    points.push({
      minute,
      time: `${String(Math.floor(minute)).padStart(2, '0')}:00`,
      simulated: clampValue(initialSoc - simulatedUsedWh / effectiveCapacityWh * 100, 0, 100),
      expected: clampValue(initialSoc - expectedUsedWh / effectiveCapacityWh * 100, 0, 100),
    });
  }

  const errors = points.map(point => point.simulated - point.expected);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
  return { points, basePowerW, capacityWh: effectiveCapacityWh, initialSoc, durationMinutes: duration, mae, rmse };
}
