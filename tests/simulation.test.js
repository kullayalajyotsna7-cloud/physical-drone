import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, initial, scenarios, validateMission } from '../src/simulation/model.js';
import { BATTERY_CAPACITY_WH, createBatteryBenchmark } from '../src/simulation/benchmark.js';
import { useTwin } from '../src/simulation/store.js';
import { predictLocally } from '../src/simulation/api.js';
import { applyFailureInjection, deriveTelemetry, predictFailures, routeRiskProfile, normalizePhysicalTelemetry, whatIfComparison } from '../src/simulation/intelligence.js';
import { getMission, waypointPosition } from '../src/simulation/model.js';

test('power and battery drain remain finite and follow pack energy', () => {
  const state = initial();
  const metrics = calculate(state);
  assert.ok(metrics.power > metrics.hover);
  assert.ok(Number.isFinite(metrics.risk));
  assert.ok(Math.abs(metrics.batteryRate - metrics.power / (state.voltage * 5.2 * 3600) * 100) < 1e-10);
});

test('drag increases with airspeed and decreases with density at altitude', () => {
  const state = initial();
  const faster = calculate({ ...state, velocity: state.speedSetpoint * 2 });
  const higher = calculate({ ...state, position: [0, 3500, 0] });
  assert.ok(faster.drag > calculate(state).drag);
  assert.ok(higher.density < calculate(state).density);
});

test('battery benchmark is deterministic, bounded, and compares to energy balance', () => {
  const state = initial();
  const result = createBatteryBenchmark(state);
  const repeated = createBatteryBenchmark(state);
  assert.equal(BATTERY_CAPACITY_WH, 115.44);
  assert.equal(result.points.length, 13);
  assert.deepEqual(result.points, repeated.points);
  assert.equal(result.points[0].simulated, state.battery);
  assert.equal(result.points[0].expected, state.battery);
  assert.ok(result.points.at(-1).simulated < state.battery);
  assert.ok(result.points.every(point => point.simulated >= 0 && point.expected >= 0 && point.simulated <= 100 && point.expected <= 100));
  assert.ok(result.mae >= 0 && result.rmse >= result.mae);
});

test('nominal route passes preflight; empty manual route and unsafe wind are blocked', () => {
  assert.equal(validateMission(initial()).ready, true);
  const empty = { ...initial(), missionType: 'manual', missionRoute: [] };
  assert.match(validateMission(empty).issues.join(' '), /at least one waypoint/i);
  const wind = { ...initial(), wind: 39 };
  assert.match(validateMission(wind).issues.join(' '), /wind exceeds/i);
});

test('low reserve recommends return with an explicit reason and fails preflight', () => {
  const low = { ...initial(), battery: 20 };
  const metrics = calculate(low);
  assert.equal(metrics.decision, 'RETURN TO BASE');
  assert.match(metrics.reason, /return threshold/i);
  assert.equal(validateMission(low).ready, false);
});

test('added stress scenarios expose their target conditions', () => {
  assert.ok(scenarios['HEAVY PAYLOAD + MICROBURST'].payload > 4);
  assert.ok(scenarios['HEAVY PAYLOAD + MICROBURST'].turbulence > 0.8);
  assert.ok(scenarios['DEGRADED MOTOR'].degradation > 0.4);
  assert.ok(scenarios['HOT / LOW-DENSITY AIR'].temperature > 55);
  assert.ok(scenarios['HOT / LOW-DENSITY AIR'].airDensity < initial().airDensity);
});

test('local inference returns confidence, directive, and an explanation without claiming trained ML', async () => {
  const result = await predictLocally(initial());
  assert.equal(result.inference.trainedModel, false);
  assert.equal(result.inference.advisory, result.decision);
  assert.ok(result.inference.confidence >= 0 && result.inference.confidence <= 100);
  assert.ok(result.inference.reasons.length > 0);
});

test('start simulation moves the drone on the shared simulation tick', () => {
  useTwin.getState().reset();
  useTwin.getState().start();
  assert.equal(useTwin.getState().running, true);
  const before = useTwin.getState().position;
  useTwin.getState().tick(0.1);
  const after = useTwin.getState().position;
  assert.ok(Math.hypot(after[0] - before[0], after[2] - before[2]) > 0);
  useTwin.getState().reset();
});


test('telemetry twin derives changing position, motor state, and component health honestly', () => {
 const state=initial(),metrics=calculate(state),telemetry=deriveTelemetry(state,metrics);
 assert.equal(telemetry.source,'SIMULATED');assert.equal(telemetry.gps.latitude,13.63551);assert.ok(telemetry.motorTemperature>state.temperature);assert.ok(telemetry.motorHealth>0&&telemetry.motorHealth<=100);
 const moved=deriveTelemetry({...state,position:[111,12,50],running:true,velocity:8},metrics);assert.notEqual(moved.gps.longitude,telemetry.gps.longitude);assert.ok(moved.motorRpm>0);
});

test('physics and telemetry fusion raises explainable motor anomaly risk for injected fault', () => {
 const state=initial(),fault=applyFailureInjection(state,'MOTOR FAILURE'),telemetry=deriveTelemetry({...fault,running:true},calculate(fault)),prediction=predictFailures(telemetry);
 assert.equal(prediction.highest.system,'Motor / bearing');assert.ok(prediction.items[0].risk>40);assert.ok(prediction.items[0].delta>0);assert.match(prediction.items[0].action,/reduce|return/i);assert.ok(prediction.items[0].delta>0);
});

test('navigation loss recommends and executes controlled simulated emergency landing', () => {
 const fault=applyFailureInjection(initial(),'GPS LOSS'),metrics=calculate(fault);assert.equal(metrics.decision,'EMERGENCY LAND');assert.equal(metrics.feasible,false);
 useTwin.getState().reset();useTwin.getState().setFailure('GPS LOSS');useTwin.getState().emergencyLand();useTwin.getState().tick(.1);assert.ok(useTwin.getState().position[1]<3.1);assert.ok(useTwin.getState().events.some(e=>/emergency landing/i.test(e.text)));useTwin.getState().reset();
});

test('route risk covers each waypoint and increases with depleted reserve', () => {
 const state=initial(),profile=routeRiskProfile(state,calculate,getMission,waypointPosition),low=routeRiskProfile({...state,battery:28},calculate,getMission,waypointPosition);
 assert.equal(profile.length,getMission(state).length-1);assert.ok(profile.every(x=>x.risk>=0&&x.risk<=100));assert.ok(low.at(-1).battery<profile.at(-1).battery);assert.ok(low.at(-1).risk>=profile.at(-1).risk);
});

test('what-if comparison and physical JSON adapter preserve units and GPS position', () => {
 const state=initial(),changed=calculate({...state,wind:30,payload:4,battery:70,temperature:40});assert.equal(whatIfComparison(changed,calculate(state)).length,4);
 const physical=normalizePhysicalTelemetry({battery_percent:67,voltage:21.1,current:4.2,latitude:13.64,longitude:79.43,altitude_m:82,speed_mps:14.2,motor_temperature:58,motor_rpm:3900},state);
 assert.equal(physical.telemetrySource,'PHYSICAL TELEMETRY');assert.equal(physical.battery,67);assert.equal(physical.position[1],82);assert.ok(Math.abs(physical.position[0])>0);assert.throws(()=>normalizePhysicalTelemetry({battery_percent:'bad'},state),/Invalid/);
});

test('failure injection switches and clears without erasing active scenario controls', () => {
 const scenario={...initial(),wind:22,payload:3.1,motorEfficiency:.82};const motor=applyFailureInjection(scenario,'MOTOR FAILURE');const gps=applyFailureInjection(motor,'GPS LOSS');const cleared=applyFailureInjection(gps,null);
 assert.equal(gps.gpsValid,false);assert.equal(cleared.wind,22);assert.equal(cleared.payload,3.1);assert.equal(cleared.motorEfficiency,.82);assert.equal(cleared.failure,null);
});
