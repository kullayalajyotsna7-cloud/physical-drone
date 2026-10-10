import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArduinoSerialLine } from '../src/simulation/arduinoSerial.js';
import { useTwin } from '../src/simulation/store.js';

test('Arduino telemetry parser reads and bounds all seven sensor fields',()=>{
  const packet=parseArduinoSerialLine('ALT=12.4,ACC=0.7,PITCH=4.2,ROLL=-2.1,YAW=35.6,THR=62,BAT=78');
  assert.deepEqual(packet,{altitude_m:12.4,measured_acceleration_mps2:.7,pitch_deg:4.2,roll_deg:-2.1,yaw_deg:35.6,throttle_percent:62,battery_percent:78});
  assert.throws(()=>parseArduinoSerialLine('ALT=12,ACC=0,PITCH=0,ROLL=0,YAW=0,THR=101,BAT=78'),/THR must be between/);
  assert.throws(()=>parseArduinoSerialLine('ALT=12,ACC=0'),/Missing fields/);
});

test('Arduino packets drive live twin position, attitude, altitude, and source labels',()=>{
  const twin=useTwin.getState();twin.reset();
  twin.applyArduinoTelemetry({altitude_m:12.4,measured_acceleration_mps2:.7,pitch_deg:4.2,roll_deg:-2.1,yaw_deg:35.6,heading_rad:35.6*Math.PI/180,throttle_percent:62,battery_percent:78,x_m:3,z_m:7,speed_mps:4,voltage:21.3,current:5,telemetry_source:'TINKERCAD SERIAL · MANUAL'});
  const state=useTwin.getState();
  assert.equal(state.telemetrySource,'TINKERCAD SERIAL · MANUAL');
  assert.equal(state.position[1],12.4);assert.equal(state.position[0],3);assert.equal(state.position[2],7);
  assert.ok(Math.abs(state.pitch-4.2*Math.PI/180)<1e-8);assert.ok(Math.abs(state.roll+2.1*Math.PI/180)<1e-8);
  assert.equal(state.throttlePercent,62);assert.equal(state.battery,78);assert.equal(state.running,true);
  state.reset();
});
