import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {useTwin} from './simulation/store';
import {localToLatLng,latLngToLocal,TIRUPATI_ORIGIN} from './utils/coordinateConverter';

const toGps=p=>localToLatLng(p[0],p[2]);
const inBounds=(x,z)=>Math.abs(x)<=500&&Math.abs(z)<=500;

export function LeafletMapView({position,heading,battery,risk,mission}){
 const host=useRef(null),mapRef=useRef(null),droneRef=useRef(null),routeRef=useRef(null),pointsRef=useRef([]),lastPan=useRef(0);
 const [tileWarning,setTileWarning]=useState(false);
 const manualMode=useTwin(s=>s.manualMode),selectedWaypoint=useTwin(s=>s.selectedWaypoint),missionType=useTwin(s=>s.missionType),running=useTwin(s=>s.running),routeIndex=useTwin(s=>s.routeIndex),returning=useTwin(s=>s.returning);
 const gps=toGps(position);
 useEffect(()=>{
  if(!host.current||mapRef.current)return;
  const map=L.map(host.current,{zoomControl:true,preferCanvas:true}).setView([TIRUPATI_ORIGIN.latitude,TIRUPATI_ORIGIN.longitude],16);mapRef.current=map;
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  tiles.on('tileerror',()=>setTileWarning(true));tiles.on('tileload',()=>setTileWarning(false));
  droneRef.current=L.marker([gps.latitude,gps.longitude],{icon:L.divIcon({className:'leaflet-drone-icon',html:'<span class="leaflet-drone-arrow">▲</span>',iconSize:[30,30],iconAnchor:[15,15]}),zIndexOffset:1000}).addTo(map).bindTooltip('Simulated drone');
  map.on('click',e=>{const s=useTwin.getState();if(!s.manualMode||s.running)return;const [x,z]=latLngToLocal(e.latlng.lat,e.latlng.lng);if(inBounds(x,z))s.addWaypoint([x,s.altitude,z]);});
  L.Util.requestAnimFrame(()=>map.invalidateSize());
  return()=>{map.remove();mapRef.current=null;droneRef.current=null;routeRef.current=null;pointsRef.current=[]};
 },[]);
 useEffect(()=>{if(mapRef.current)drawRoute(mapRef.current,mission,{routeRef,pointsRef,selectedWaypoint,manualMode,missionType,running,routeIndex,returning,position});},[mission,selectedWaypoint,manualMode,missionType,running,routeIndex,returning]);
 useEffect(()=>{if(!droneRef.current||!mapRef.current)return;droneRef.current.setLatLng([gps.latitude,gps.longitude]);droneRef.current.getElement()?.style.setProperty('--drone-heading',`${(heading*180/Math.PI+360)%360}deg`);if(Date.now()-lastPan.current>1200){mapRef.current.panTo([gps.latitude,gps.longitude],{animate:false});lastPan.current=Date.now()}},[gps.latitude,gps.longitude,heading]);
 const selected=mission.find(w=>w.id===selectedWaypoint);
 return <div className="map-view"><div ref={host} className="leaflet-map" aria-label="Interactive Leaflet map. Click to add waypoints and drag waypoint markers."/>{tileWarning&&<div className="map-tile-warning">Map imagery is unavailable. Waypoint editing and the local grid still work.</div>}<div className="map-overlay map-top"><span className="map-pin"/> SIMULATED DRONE <b>{gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}</b>{manualMode&&<strong>CLICK MAP TO ADD WAYPOINTS</strong>}</div>{selected&&<div className="map-overlay waypoint-pop"><b>{selected.id} · {selected.name}</b><span>{selected.type} · ALT {selected.altitude} m · PRIORITY {selected.priority||'NORMAL'}</span></div>}<div className="map-overlay map-bottom"><b>SIMULATED GPS · TIRUPATI, ANDHRA PRADESH, INDIA</b><span>HDG {((heading*180/Math.PI+360)%360).toFixed(0)}° · BAT {battery.toFixed(0)}% · RISK {risk}/100</span></div></div>;
}

function drawRoute(map,mission,refs){
 const {routeRef,pointsRef,selectedWaypoint,missionType,manualMode,running,routeIndex,returning,position}=refs;
 routeRef.current?.remove();pointsRef.current.forEach(layer=>layer.remove());
 const base=mission[0]||{id:'BASE',name:'BASE',p:[0,3,0]},activeRoute=returning?[position,base.p]:[position,...mission.slice(Math.max(1,routeIndex)).map(w=>w.p),base.p];
 const routeLatLngs=activeRoute.map(toGps).map(p=>[p.latitude,p.longitude]),group=L.layerGroup().addTo(map);
 group.addLayer(L.polyline(routeLatLngs,{color:returning?'#dc5959':'#169f88',weight:4,opacity:.9,dashArray:returning?'8 6':undefined}));
 const editable=missionType==='manual'&&manualMode&&!running;
 pointsRef.current=mission.map((w,i)=>{const p=toGps(w.p),isBase=i===0;const marker=L.marker([p.latitude,p.longitude],{draggable:!isBase&&editable,bubblingMouseEvents:false,icon:L.divIcon({className:`mission-waypoint-icon ${isBase?'base':''} ${w.id===selectedWaypoint?'selected':''}`,html:`<span>${isBase?'BASE':w.id}</span>`,iconSize:[42,30],iconAnchor:[21,15]})}).addTo(map);marker.bindTooltip(`${isBase?'BASE':w.id} · ${w.name} · ${w.type||'BASE'} · ${w.altitude??3} m`,{direction:'top'});if(!isBase){marker.on('click',()=>useTwin.getState().selectWaypoint(w.id));marker.on('dragend',e=>{const ll=e.target.getLatLng(),[x,z]=latLngToLocal(ll.lat,ll.lng);if(inBounds(x,z))useTwin.getState().updateWaypoint(w.id,{p:[x,0,z]});else map.panTo([p.latitude,p.longitude])})}return marker});
 routeLatLngs.slice(1).forEach((p,i)=>{const q=routeLatLngs[i],angle=Math.atan2(p[0]-q[0],p[1]-q[1])*180/Math.PI;group.addLayer(L.marker([(p[0]+q[0])/2,(p[1]+q[1])/2],{interactive:false,icon:L.divIcon({className:'route-direction-icon',html:`<span style="transform:rotate(${angle}deg)">➤</span>`,iconSize:[18,18],iconAnchor:[9,9]})}))});
 routeRef.current=group;
 if(mission.length>1&&!running&&!returning){const bounds=L.latLngBounds(routeLatLngs);if(bounds.isValid())map.fitBounds(bounds.pad(.2),{maxZoom:17,animate:false})}
}

export function RadarView({position,heading,battery,risk,routeIndex,returning,mission}){
 const cx=300,cy=200,radius=165,point=p=>{const dx=p[0]-position[0],dz=p[2]-position[2],d=Math.hypot(dx,dz),scale=Math.min(d,290)/Math.max(d,1)*radius/290;return[cx+dx*scale,cy+dz*scale]},base=mission[0]?.p||[0,3,0],targets=returning?[{id:'BASE',name:'BASE',p:base}]:[...mission.slice(Math.max(1,routeIndex)),{id:'BASE',name:'BASE',p:base}],route=[position,...targets.map(w=>w.p)].map(point).map(p=>p.join(',')).join(' '),active=returning?mission[0]:mission[Math.min(routeIndex,mission.length-1)];
 return <div className="radar-view"><svg viewBox="0 0 600 400" role="img" aria-label="Live drone radar and shared mission route"><defs><radialGradient id="radarGlow"><stop stopColor="#163d50"/><stop offset="1" stopColor="#0b1e2c"/></radialGradient><linearGradient id="sweepFade"><stop stopColor="#52e7c0" stopOpacity=".28"/><stop offset="1" stopColor="#52e7c0" stopOpacity="0"/></linearGradient></defs><rect width="600" height="400" rx="8" fill="url(#radarGlow)"/>{[45,85,125,165].map(r=><circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#326071" strokeWidth="1"/>)}<path d={`M${cx} 22V378M22 ${cy}H578`} stroke="#326071"/><path d={`M${cx} ${cy}L${cx+radius} ${cy}`} fill="none" stroke="url(#sweepFade)" strokeWidth="2" className="radar-sweep"/><polyline points={route} fill="none" stroke={returning?'#ee6666':'#43bda6'} strokeWidth="2" strokeDasharray="5 5" opacity=".9"/>{mission.map((w,i)=>{const[x,y]=point(w.p),current=!returning&&i===routeIndex;return <g key={w.id}><circle cx={x} cy={y} r={current?5:3.5} fill={current?'#ffc461':i===0?'#41c8c0':'#6fd8c1'} stroke="#0b1e2c" strokeWidth="2"/><text x={x+7} y={y-6} fill="#c4dce1" fontSize="9">{i===0?'BASE':w.id}</text></g>})}<g transform={`translate(${cx} ${cy}) rotate(${heading*180/Math.PI})`}><path d="M0 -12L8 9L0 5L-8 9Z" fill="#fff" stroke="#55e6c1" strokeWidth="2"/></g><text x="24" y="28" fill="#9abac5" fontSize="10" letterSpacing="2">TACTICAL RADAR · RELATIVE RANGE</text><text x="24" y="382" fill="#8ba8b4" fontSize="10">DRONE CENTER · ACTIVE: {active?.name||'BASE'}</text><text x="450" y="28" fill="#8ba8b4" fontSize="10">BAT {battery.toFixed(0)}% · RISK {risk}</text></svg><div className="radar-caption">Radar distances are relative to the shared mission route.</div></div>;
}
