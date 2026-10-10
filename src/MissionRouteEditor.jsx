import React, { useState } from 'react';
import { defaultMissionRoute } from './simulation/model';

export default function MissionRouteEditor({ state }) {
  const [draft, setDraft] = useState(() => state.missionRoute.map(w => `${w.p[0]}, ${w.p[2]}`).join('\n'));
  const [error, setError] = useState('');
  const apply = () => {
    const rows = draft.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
    const coordinates = rows.map(row => row.split(',').map(value => Number(value.trim())));
    if (!coordinates.length || coordinates.some(pair => pair.length !== 2 || pair.some(v => !Number.isFinite(v) || Math.abs(v) > 500))) {
      setError('Enter one valid X,Z pair per line, within ±500 meters.');
      return;
    }
    state.setMissionRoute(coordinates.map(([x, z], i) => ({
      id: `W${i + 1}`, name: `USER WAYPOINT ${i + 1}`, p: [x, 0, z], type: 'WAYPOINT', altitude: state.altitude, priority:'NORMAL', description:'',
    })));
    setError('');
  };
  const restore = () => {
    const preset = defaultMissionRoute.map(w => `${w.p[0]}, ${w.p[2]}`).join('\n');
    setDraft(preset);
    state.setMissionRoute(defaultMissionRoute);
    setError('');
  };
  return <>
    <div className="side-separator"/>
    <div className="side-head"><span>RETURN & USER ROUTE</span><span className="manual-tag">SAFETY</span></div>
    <div className="slider-control"><div><span>RETURN TO BASE AT BATTERY</span><b>{state.returnThreshold}%</b></div><input aria-label="Battery return threshold" type="range" min="92" max="93" step="1" value={state.returnThreshold} onChange={e => state.control('returnThreshold', +e.target.value)}/><small>Automatic return at the selected battery level · 92–93%</small></div>
    <div className="route-editor">
      <label htmlFor="user-route">WAYPOINTS · X,Z METERS FROM BASE</label>
      <textarea id="user-route" rows="5" value={draft} disabled={state.running} onChange={e => setDraft(e.target.value)} spellCheck="false"/>
      <small>One waypoint per line, such as 35, 18. Drone visits each point, then returns to base.</small>
      {error && <div className="route-error">{error}</div>}
      <div className="route-actions"><button disabled={state.running} onClick={apply}>APPLY ROUTE</button><button disabled={state.running} onClick={restore}>PRESET</button></div>
      {state.running && <small>Pause the mission to edit its route.</small>}
    </div>
  </>;
}
