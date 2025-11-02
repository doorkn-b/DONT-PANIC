import React, { useState } from 'react';
import './App.css';
import EarthRealistic from './components/EarthRealistic';
import SatelliteLookup from './components/SatelliteLookup';
import SpaceWeather from './components/SpaceWeather';
import RecentDecays from './components/RecentDecays';

function App() {
  const [showLookup, setShowLookup] = useState(false);
  const [showSpaceWeather, setShowSpaceWeather] = useState(false);
  const [showDecays, setShowDecays] = useState(false);

  return (
    <div className="App">
      {/* Toggle Buttons */}
      <button 
        className="lookup-toggle"
        onClick={() => setShowLookup(!showLookup)}
      >
        {showLookup ? 'Close' : 'Historical'}
      </button>

      <button 
        className="weather-toggle"
        onClick={() => setShowSpaceWeather(!showSpaceWeather)}
      >
        {showSpaceWeather ? 'Close' : 'Space Weather'}
      </button>

      <button 
        className="decays-toggle"
        onClick={() => setShowDecays(!showDecays)}
      >
        {showDecays ? 'Close' : 'Recent Decays'}
      </button>

      {/* Main 3D View */}
      <EarthRealistic />

      {/* Dropdown Panel */}
      {showLookup && (
        <div className="lookup-panel">
          <SatelliteLookup />
        </div>
      )}

      {/* Space Weather Sidebar */}
      {showSpaceWeather && (
        <SpaceWeather />
      )}

      {/* Recent Decays Panel */}
      {showDecays && (
        <div className="decays-panel">
          <RecentDecays />
        </div>
      )}
    </div>
  );
}

export default App;
