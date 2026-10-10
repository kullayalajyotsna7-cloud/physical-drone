const fields = {
  ALT: ['altitude_m', 0, 500],
  ACC: ['measured_acceleration_mps2', -50, 50],
  PITCH: ['pitch_deg', -180, 180],
  ROLL: ['roll_deg', -180, 180],
  YAW: ['yaw_deg', -360, 360],
  THR: ['throttle_percent', 0, 100],
  BAT: ['battery_percent', 0, 100],
};

export function parseArduinoSerialLine(line) {
  if (typeof line !== 'string') throw new Error('Serial line must be text');
  const packet = {};
  for (const token of line.trim().split(/[;,\s]+/)) {
    if (!token) continue;
    const match = token.match(/^([A-Z_]+)=(-?(?:\d+\.?\d*|\.\d+))$/i);
    if (!match) throw new Error(`Invalid telemetry token: ${token}`);
    const key = match[1].toUpperCase();
    const field = fields[key];
    if (!field) throw new Error(`Unknown telemetry field: ${key}`);
    const value = Number(match[2]);
    if (!Number.isFinite(value) || value < field[1] || value > field[2]) throw new Error(`${key} must be between ${field[1]} and ${field[2]}`);
    packet[field[0]] = value;
  }
  const required = ['ALT','ACC','PITCH','ROLL','YAW','THR','BAT'];
  const missing = required.filter(key => !Object.hasOwn(packet, fields[key][0]));
  if (missing.length) throw new Error(`Missing fields: ${missing.join(', ')}`);
  return packet;
}
