import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Esp32Simulator from './Esp32Simulator.jsx';
import ArduinoBridge from './ArduinoBridge.jsx';
import SystemArchitecture from './SystemArchitecture.jsx';
import './styles.css';

const Root = window.location.pathname === '/esp32-simulator' ? Esp32Simulator : window.location.pathname === '/arduino-bridge' ? ArduinoBridge : window.location.pathname === '/architecture' ? SystemArchitecture : App;
createRoot(document.getElementById('root')).render(<Root />);
