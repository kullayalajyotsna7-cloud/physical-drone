// Deterministic, explainable local twin. Values are SI unless marked otherwise.
export const baseMission = [
  { id:'BASE', name:'DRONE BASE', p:[0,0,0], type:'base' },
  { id:'W1', name:'WAYPOINT 1', p:[35,0,18], type:'waypoint' },
  { id:'WX', name:'WEATHER STATION', p:[72,3,4], type:'station' },
  { id:'W2', name:'WAYPOINT 2', p:[108,0,22], type:'waypoint' },
  { id:'WH', name:'INDUSTRIAL ZONE', p:[148,0,0], type:'warehouse' },
  { id:'W3', name:'WAYPOINT 3', p:[181,0,24], type:'waypoint' },
  { id:'MT', name:'MOUNTAIN OBSERVATION', p:[216,4,45], type:'mountain' },
  { id:'W4', name:'WAYPOINT 4', p:[247,0,21], type:'waypoint' },
  { id:'TARGET', name:'EMERGENCY ZONE', p:[278,0,5], type:'target' },
];
export const defaultMissionRoute = baseMission.slice(1).map((w, i) => ({...w, id:`W${i+1}`, name:w.name, type:i===2?'INSPECTION':i===4?'SEARCH ZONE':'WAYPOINT', priority:'NORMAL', description:'', altitude:35}));
export const getMission = s => [baseMission[0], ...(s.missionType === 'manual' ? (s.missionRoute || []) : defaultMissionRoute)];
export const waypointPosition = (waypoint, fallbackAltitude=35) => waypoint.id === 'BASE' ? [0,3,0] : [waypoint.p[0], waypoint.altitude ?? fallbackAltitude, waypoint.p[2]];
export const initial = () => ({ running:false, ended:false, returning:false, elapsed:0, position:[0,3,0], velocity:0, verticalVelocity:0, acceleration:0, gyro:0, heading:0, pitch:0, roll:0, throttlePercent:0, battery:96, returnThreshold:25, missionType:'predefined', missionRoute:[], manualMode:false, add3DMode:false, draggingWaypoint:null, selectedWaypoint:null, voltage:22.2, current:0, power:0, energy:0, distance:0, payload:1.5, mass:4.2, motorEfficiency:.94, rotorEfficiency:.91, degradation:.04, temperature:31, wind:8, windDir:245, turbulence:.12, airDensity:1.19, altitude:35, speedSetpoint:12, scenario:'NORMAL MISSION', routeIndex:1, maxWind:8, minBattery:96, maxTemp:31, maxRisk:0, samples:[], events:[{t:0,type:'SYSTEM',text:'Twin initialized · Inspection Route Alpha ready',severity:'info'}], decision:'STANDBY', reason:'System ready. Start the mission to begin live analysis.', risk:8, confidence:94, uncertainty:4, summary:null, safetyCount:0, selected:null, camera:'DRONE VIEW', follow:false, demo:false, powered:false, failure:null, telemetrySource:'SIMULATED', gpsValid:true, sensorValid:true, batteryHealth:100, batteryDegradation:0, motorTemperature:35, motorTempMeasured:false, motorRpm:0, gps:null, emergencyLanding:false });
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function calculate(s){
 const mission=getMission(s);
 const target=waypointPosition(mission[s.returning?0:Math.min(s.routeIndex,mission.length-1)],s.altitude);
 const distanceTarget=dist(s.position,target), distanceBase=dist(s.position,waypointPosition(baseMission[0]));
 const speed=Math.max(2,s.velocity||s.speedSetpoint), relativeWind=Math.abs(s.wind*Math.cos((s.windDir-s.heading)*Math.PI/180)/3.6);
 const density=s.airDensity*Math.exp(-Math.max(0,s.position[1])/8500);
 const drag=.5*density*.82*.24*Math.pow(Math.max(0,speed+relativeWind),2);
 // Hover power scales with mass^1.5; drag power is D*v; climb and inefficiency add losses.
 const hover=76*Math.pow(s.mass/4.2,1.5)/(s.rotorEfficiency||.7), dragPower=drag*speed;
 const climb=8+Math.abs(target[1]-s.position[1])*2.3;
 const power=(hover+dragPower+climb+22*s.wind/20+18*s.payload/3)/(s.motorEfficiency*s.rotorEfficiency)*(1+s.degradation*.8);
 const packHealth=clamp(s.batteryHealth??100,35,100)/100;
 const batteryRate=power/((s.voltage*5.2*packHealth)*3600)*100;
 let risk=Math.round(clamp(8 + Math.max(0,s.wind-28)*1.35+Math.max(0,s.turbulence-.35)*55+Math.max(0,s.temperature-42)*1.7+Math.max(0,s.payload-2.5)*9+s.degradation*48+Math.max(0,35-s.battery)*1.1+Math.max(0,8-s.motorEfficiency*10)*7+Math.max(0,s.position[1]-80)*.35,0,100));
 // Distance / speed yields seconds; convert power-seconds to Wh and allow margin for turns.
 const returnWh=distanceBase*power/Math.max(4,s.speedSetpoint)/3600*1.35, missionWh=distanceTarget*power/Math.max(4,s.speedSetpoint)/3600*1.35;
 const planPoints=[waypointPosition(baseMission[0]),...mission.slice(1).map(w=>waypointPosition(w,s.altitude)),waypointPosition(baseMission[0])];
 const routeDistance=planPoints.slice(1).reduce((sum,p,i)=>sum+dist(planPoints[i],p),0);
 const estimatedDuration=routeDistance/Math.max(4,s.speedSetpoint);
 const estimatedEnergy=planPoints.slice(1).reduce((sum,b,i)=>{const a=planPoints[i],d=dist(a,b),bearing=Math.atan2(b[0]-a[0],b[2]-a[2]),cross=Math.abs(s.wind*Math.sin(s.windDir*Math.PI/180-bearing))/3.6,head=Math.max(0,s.wind*Math.cos(s.windDir*Math.PI/180-bearing))/3.6,air=s.airDensity*Math.exp(-Math.max(0,a[1])/8500),legDrag=.5*air*.82*.24*(s.speedSetpoint+head)**2,legHover=76*Math.pow(s.mass/4.2,1.5)/(s.rotorEfficiency||.7),climbLoad=8+Math.max(0,b[1]-a[1])*2.3,legPower=(legHover+legDrag*s.speedSetpoint+climbLoad+22*(s.wind+cross)/20+18*s.payload/3)/(s.motorEfficiency*s.rotorEfficiency)*(1+s.degradation*.8);return sum+legPower*d/Math.max(4,s.speedSetpoint)/3600*1.35},0);
 const estimatedReturnBattery=clamp(s.battery-estimatedEnergy/115.4*100,0,100);
 const capacityWh=115.44*packHealth, energyLeft=capacityWh*s.battery/100;
 const destinationBattery=clamp(s.battery-missionWh/capacityWh*100,0,100), returnBattery=clamp(s.battery-returnWh/capacityWh*100,0,100);
 const confidence=Math.round(clamp(97-s.turbulence*24-Math.max(0,s.wind-18)*.45-s.degradation*18-Math.abs(s.wind-s._previousWind||0)*.4,52,98));
 const fail=risk>82||s.temperature>68||s.battery<9||s.motorEfficiency<.55||s.sensorValid===false;
 const navigationFailure=s.gpsValid===false;
 if(s.failure==='MOTOR FAILURE'||s.failure==='MOTOR BEARING')risk=Math.max(risk,78);
 if(s.failure==='GPS LOSS'||s.failure==='SENSOR FAILURE')risk=Math.max(risk,85);
 let decision='CONTINUE',reason='Conditions are within the safe operating envelope; the planned route remains feasible.';
 if(s.emergencyLanding||navigationFailure||s.sensorValid===false){decision='EMERGENCY LAND';reason=s.emergencyLanding?'Operator requested a controlled vertical landing at the current position.':'Navigation or critical sensor integrity is unavailable. The simulation recommends a controlled vertical landing at the current position.'}
 else if(s.battery<=s.returnThreshold){decision='RETURN TO BASE';reason=`Battery reached the ${s.returnThreshold}% return threshold. The drone is returning to base.`}
 else if(fail){decision='MISSION ABORT';reason=`Critical operating limit reached: ${s.temperature>68?'battery temperature':s.battery<9?'battery reserve':'combined risk'} requires immediate return to base.`}
 else if(s.failure==='MOTOR FAILURE'&&risk>=75){decision='RETURN TO BASE';reason='Injected motor failure raises imbalance risk. Reduce load and return to base immediately.'}
 else if(risk>=68){decision='RETURN TO BASE';reason=`Mission risk reached ${risk}/100. Returning to base while battery is ${Math.round(s.battery)}%.`}
 else if(risk>=48||s.wind>28||s.turbulence>.42){decision='SLOW DOWN';reason=`Environmental load is elevated (wind ${s.wind.toFixed(0)} km/h, turbulence ${(s.turbulence*100).toFixed(0)}%). Reduced speed lowers drag power and preserves reserve.`}
 else if(s.position[1]>62){decision='CHANGE ALTITUDE';reason='Altitude is approaching the safe ceiling; descending reduces exposure and stabilizes the energy estimate.'}
 const waypointsSafe=mission.slice(1).every(w=>w.p.every(Number.isFinite)&&Math.abs(w.p[0])<=500&&Math.abs(w.p[2])<=500&&(w.altitude??s.altitude)>=10&&(w.altitude??s.altitude)<=80);
 const envelopeSafe=s.wind<=32&&s.payload<=5&&waypointsSafe;
 return {target,distanceTarget,distanceBase,relativeWind,drag,hover,dragPower,power,batteryRate,risk,returnWh,missionWh,destinationBattery,returnBattery,estimatedReturnBattery,routeDistance,estimatedDuration,estimatedEnergy,density,confidence,uncertainty:Math.round((100-confidence)/2+2),decision,reason,feasible:mission.length>1&&estimatedReturnBattery>=20&&risk<68&&envelopeSafe&&s.gpsValid!==false&&s.sensorValid!==false,eta:distanceTarget/Math.max(4,s.speedSetpoint),remainingEndurance:energyLeft/Math.max(power,1)*3600,remainingDistance:energyLeft/Math.max(power,1)*Math.max(4,s.speedSetpoint)};
}
export function validateMission(s){
 const metrics=calculate(s),mission=getMission(s),issues=[];
 if(mission.length<2)issues.push('Add at least one waypoint.');
 if(s.battery<=s.returnThreshold)issues.push(`Battery is at or below the ${s.returnThreshold}% return threshold. Recharge above the threshold before launch.`);
 if(s.wind>32)issues.push('Wind exceeds the 32 km/h safe operating limit.');
 if(s.payload>5)issues.push('Payload exceeds the 5 kg limit.');
 if(mission.slice(1).some(w=>!w.p.every(Number.isFinite)||Math.abs(w.p[0])>500||Math.abs(w.p[2])>500))issues.push('A waypoint is outside the reachable ±500 m mission area.');
 if(mission.slice(1).some(w=>(w.altitude??s.altitude)<10||(w.altitude??s.altitude)>80))issues.push('Waypoint altitude must be between 10 m and 80 m.');
 if(metrics.estimatedReturnBattery<20)issues.push(`Predicted battery after the full route and return is ${Math.round(metrics.estimatedReturnBattery)}%; 20% is required.`);
 if(metrics.risk>=68)issues.push(`Predicted risk is ${metrics.risk}/100; reduce risk before launch.`);
 return {ready:issues.length===0,issues,metrics};
}
export const scenarios={
 'NORMAL MISSION':{wind:8,turbulence:.12,temperature:31,battery:96,payload:1.5,degradation:.04,motorEfficiency:.94},
 'STRONG WIND':{wind:39,turbulence:.25,temperature:32,battery:96,payload:1.5,degradation:.04,motorEfficiency:.94},
 'HEAVY TURBULENCE':{wind:18,turbulence:.72,temperature:32,battery:96,payload:1.5,degradation:.04,motorEfficiency:.94},
 'HIGH TEMPERATURE':{wind:8,turbulence:.12,temperature:57,battery:82,payload:1.5,degradation:.04,motorEfficiency:.94},
 'LOW BATTERY':{wind:8,turbulence:.12,temperature:31,battery:27,payload:1.5,degradation:.04,motorEfficiency:.94},
 'HEAVY PAYLOAD':{wind:8,turbulence:.12,temperature:31,battery:96,payload:4.1,degradation:.04,motorEfficiency:.94},
 'MOTOR DEGRADATION':{wind:8,turbulence:.12,temperature:35,battery:84,payload:1.5,degradation:.42,motorEfficiency:.69},
 'COMBINED FAILURE':{wind:37,turbulence:.68,temperature:55,battery:46,payload:3.6,degradation:.3,motorEfficiency:.72},
 'HEAVY PAYLOAD + MICROBURST':{wind:34,turbulence:.82,temperature:34,battery:90,payload:4.4,degradation:.08,motorEfficiency:.88},
 'DEGRADED MOTOR':{wind:12,turbulence:.18,temperature:42,battery:82,payload:1.5,degradation:.48,motorEfficiency:.62},
 'HOT / LOW-DENSITY AIR':{wind:10,turbulence:.16,temperature:58,airDensity:.96,battery:84,payload:2,degradation:.08,motorEfficiency:.88}
};
export const clampValue=clamp;

