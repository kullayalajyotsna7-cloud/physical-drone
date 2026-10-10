import React,{useMemo,useState} from 'react';
import {Line,LineChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis,ReferenceLine} from 'recharts';
import {Activity,ArrowDown,ArrowUp,RotateCcw} from 'lucide-react';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function trajectory({mass,thrust,drag,altitude,velocity,thrustScale=1,dragScale=1,bias=0,elapsed=0}){
 let h=Math.max(0,altitude),v=velocity;
 return Array.from({length:49},(_,i)=>{
  const time=i*.1,measured=h+bias+(i?Math.sin((elapsed+time)*2)*.08:0);
  const acceleration=(thrust*thrustScale-mass*9.81-drag*dragScale*v*Math.abs(v))/mass;
  if(i){v+=acceleration*.1;h=Math.max(0,h+v*.1)}
  return {time,altitude:measured};
 });
}

export default function PhysicsLab({state,onFault}){
 const [whatIf,setWhatIf]=useState({mass:state.mass||4.2,thrust:58,drag:.12,battery:state.battery||96});
 const [thrustOverride,setThrustOverride]=useState(null);
 const sourceLinked=state.telemetrySource==='ESP32 SIMULATOR'||state.telemetrySource==='SOFTWARE SIMULATION'||state.telemetrySource?.startsWith('ARDUINO')||state.telemetrySource?.startsWith('TINKERCAD');
 const modelThrust=thrustOverride??(sourceLinked?state.throttlePercent*.6:whatIf.thrust);
 const targetAltitude=state.metrics?.target?.[1]??state.altitude;
 const verticalVelocity=state.verticalVelocity||0;
 const fault=state.failure||'';
 const faultEffect=useMemo(()=>{
  if(['MOTOR FAILURE','MOTOR BEARING'].includes(fault))return {thrustScale:.62,dragScale:1,bias:0,label:'REDUCED THRUST'};
  if(fault==='PROPELLER DAMAGE')return {thrustScale:.68,dragScale:1,bias:0,label:'MOTOR IMBALANCE'};
  if(fault==='BATTERY DEGRADATION')return {thrustScale:.76,dragScale:1,bias:0,label:'BATTERY DEGRADATION'};
  if(fault==='HIGH WIND')return {thrustScale:1,dragScale:2.8,bias:0,label:'EXCESSIVE DRAG'};
  if(fault==='SENSOR FAILURE'||fault==='GPS LOSS')return {thrustScale:1,dragScale:1,bias:4,label:'SENSOR ERROR'};
  return {thrustScale:1,dragScale:1,bias:0,label:''};
 },[fault]);
 const predicted=useMemo(()=>trajectory({mass:whatIf.mass,thrust:modelThrust,drag:whatIf.drag,altitude:state.position[1],velocity:verticalVelocity,elapsed:state.elapsed}),[whatIf.mass,modelThrust,whatIf.drag,state.position[1],verticalVelocity,state.elapsed]);
 const observed=useMemo(()=>trajectory({mass:whatIf.mass,thrust:modelThrust,drag:whatIf.drag,altitude:state.position[1],velocity:verticalVelocity,thrustScale:faultEffect.thrustScale,dragScale:faultEffect.dragScale,bias:faultEffect.bias,elapsed:state.elapsed}),[whatIf.mass,modelThrust,whatIf.drag,state.position[1],verticalVelocity,faultEffect,state.elapsed]);
 const chart=predicted.map((p,i)=>({time:p.time.toFixed(1),predicted:p.altitude,actual:observed[i].altitude}));
 const residual=Math.abs(chart.at(-1).predicted-chart.at(-1).actual);
 const accelerationResidual=sourceLinked?Math.abs((state.acceleration||0)-((modelThrust-state.mass*9.81)/state.mass)):0;
 const anomalous=Boolean(fault)||residual>2||(sourceLinked&&accelerationResidual>2.5);
 const weight=whatIf.mass*9.81,dragForce=whatIf.drag*verticalVelocity*Math.abs(verticalVelocity),net=modelThrust-weight-dragForce,acceleration=net/whatIf.mass;
 const landingBattery=clamp(whatIf.battery-whatIf.mass*2.1-whatIf.drag*18,0,100);
 const presets=[['REDUCED THRUST','MOTOR FAILURE'],['SENSOR ERROR','SENSOR FAILURE'],['EXCESSIVE DRAG','HIGH WIND'],['BATTERY DEGRADATION','BATTERY DEGRADATION'],['MOTOR IMBALANCE','MOTOR BEARING']];
 const apply=code=>onFault?.(fault===code?null:code);
 return <section className="physics-lab" id="physics-area">
  <header className="physics-head"><div><span><Activity size={13}/> VERTICAL DYNAMICS · LOCAL PHYSICS MODEL</span><h2>Force → acceleration → velocity → altitude</h2><p>The force model uses generated or manually entered sample values; projected altitude is anchored to the current simulated altitude. Fault responses are simulations, not flight-control outputs.</p></div><div className="physics-source">{state.telemetrySource==='SOFTWARE SIMULATION'?'SOFTWARE SIMULATION · STREAMING':state.telemetrySource?.startsWith('TINKERCAD')?'MANUAL SAMPLE · TINKERCAD FORMAT':'SIMULATED · NO HARDWARE'}</div></header>
  <div className="sensor-strip"><div><small>LIVE ALTITUDE</small><b>{state.position[1].toFixed(1)} m</b></div><div><small>VERTICAL SPEED</small><b>{verticalVelocity.toFixed(2)} m/s</b></div><div><small>ACCELEROMETER · HORIZONTAL</small><b>{(state.acceleration||0).toFixed(2)} m/s²</b></div><div><small>GYROSCOPE · YAW RATE</small><b>{((state.gyro||0)*180/Math.PI).toFixed(1)} °/s</b></div><div><small>MOTOR TEMPERATURE</small><b>{(state.motorTemperature||state.temperature).toFixed(1)} °C</b></div><div><small>BATTERY VOLTAGE</small><b>{state.voltage.toFixed(1)} V</b></div><span>{state.running?'FLIGHT STREAM · UPDATING':'SIMULATED · START FLIGHT TO STREAM'}</span></div>
  <div className="physics-grid"><div className="physics-chart"><div className="physics-chart-title"><b>ALTITUDE RESPONSE · CURRENT STATE + 4.8 s</b><span className={anomalous?'warn':'ok'}>{fault?`${faultEffect.label} ACTIVE`:anomalous?'ANOMALY':'NORMAL'} · RESIDUAL {residual.toFixed(1)} m{sourceLinked?` · ACCEL ERROR ${accelerationResidual.toFixed(1)} m/s²`:''}</span></div><div className="physics-chart-body"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="time" tick={{fontSize:10}} label={{value:'seconds from current flight state',position:'insideBottom',offset:-4}}/><YAxis domain={['auto','auto']} tick={{fontSize:10}} label={{value:'altitude (m)',angle:-90,position:'insideLeft'}}/><Tooltip/><ReferenceLine y={targetAltitude} stroke="#9aaab3" strokeDasharray="4 4" label={{value:'target',position:'insideTopRight',fontSize:9}}/><Line type="monotone" dataKey="predicted" name="Physics prediction" stroke="#168f9e" strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="actual" name="Fault response projection" stroke="#e39a43" strokeWidth={2} strokeDasharray="5 4" dot={false}/></LineChart></ResponsiveContainer></div><div className="physics-legend"><span><i/> PREDICTED · PHYSICS</span><span><i/> FAULT RESPONSE · PROJECTED</span><span>Current altitude {state.position[1].toFixed(1)} m</span></div></div>
   <div className="force-card"><b>WHAT-IF FORCE BALANCE</b><div><span>Thrust</span><strong>{modelThrust.toFixed(1)} N <ArrowUp size={13}/></strong></div><div><span>Weight · m × g</span><strong>{weight.toFixed(1)} N <ArrowDown size={13}/></strong></div><div><span>Vertical drag · D(v)</span><strong>{dragForce.toFixed(2)} N</strong></div><div><span>Net force</span><strong>{net.toFixed(1)} N</strong></div><div><span>Acceleration</span><strong>{acceleration.toFixed(2)} m/s²</strong></div><small>Fnet = T − mg − D(v) · a = Fnet / m · thrust assumes 0.6 N per throttle %</small></div></div>
  <div className="whatif-engine"><div className="whatif-engine-title"><div><b>WHAT-IF FLIGHT MODEL</b><small>Adjust parameters; the graph re-anchors to the drone’s current altitude and vertical speed.</small></div><button onClick={()=>{setThrustOverride(null);setWhatIf({mass:state.mass||4.2,thrust:58,drag:.12,battery:state.battery||96})}}><RotateCcw size={12}/> RESET</button></div><div className="physics-sliders">{[['mass','Mass',1,8,.1,'kg'],['thrust','Thrust',25,100,1,'N'],['drag','Drag coefficient',.01,.6,.01,'k'],['battery','Battery charge',5,100,1,'%']].map(([key,label,min,max,step,unit])=><label key={key}><span>{label}<b>{(key==='thrust'?modelThrust:whatIf[key]).toFixed(key==='drag'?2:1)} {unit}</b></span><input type="range" min={min} max={max} step={step} value={key==='thrust'?modelThrust:whatIf[key]} onChange={e=>key==='thrust'?setThrustOverride(Number(e.target.value)):setWhatIf({...whatIf,[key]:Number(e.target.value)})}/></label>)}</div><div className="whatif-output"><div><small>WEIGHT</small><b>{weight.toFixed(1)} N</b></div><div><small>NET FORCE</small><b>{net.toFixed(1)} N</b></div><div><small>INITIAL ACCELERATION</small><b>{acceleration.toFixed(2)} m/s²</b></div><div><small>ALTITUDE AT 4.8 S</small><b>{predicted.at(-1).altitude.toFixed(1)} m</b></div><div><small>EST. LANDING BATTERY</small><b>{landingBattery.toFixed(0)}%</b></div></div></div>
  <div className="fault-strip"><div><b>SIMULATE FAULT</b><small>{fault?`${faultEffect.label} is active; the observed trace and telemetry reflect this injection.`:'Choose a fault to change the observed altitude response and anomaly residual.'}</small></div><div className="physics-faults">{presets.map(([label,code])=><button key={label} className={fault===code?'selected':''} onClick={()=>apply(code)}>{label}</button>)}<button onClick={()=>onFault?.(null)}>CLEAR</button></div></div>
 </section>
}
