// Replace these local adapters with fetch('/predict'), '/telemetry', '/decision',
// or '/mission-state' when a FastAPI service is available. No trained model is used.
import { calculate } from './model.js';
export const predictionInput = state => ({ wind_speed:state.wind, wind_direction:state.windDir, temperature:state.temperature, air_density:state.airDensity, turbulence:state.turbulence, payload:state.payload, battery:state.battery, motor_efficiency:state.motorEfficiency, motor_degradation:state.degradation, speed:state.velocity, altitude:state.position[1], distance_remaining:state.metrics?.distanceTarget ?? 0 });
export async function predictLocally(state){
  const metrics=calculate(state);
  return {...metrics,inference:{engine:'Local physics + deterministic safety rules',trainedModel:false,confidence:metrics.confidence,advisory:metrics.decision,reasons:metrics.reason}};
}
export const endpoints={predict:'/predict',telemetry:'/telemetry',decision:'/decision',missionState:'/mission-state'};
