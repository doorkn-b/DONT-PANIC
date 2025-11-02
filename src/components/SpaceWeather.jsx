import React, { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './SpaceWeather.css';

function SpaceWeather() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);

  const fetchSpaceWeather = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/space-weather/realtime');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const weatherData = await response.json();
      
      // Debug logging
      console.log('Space weather data received:', {
        xray_points: weatherData?.xray_flux?.history_6h?.length || 0,
        solar_wind_points: weatherData?.solar_wind?.history_24h?.length || 0,
        kp_points: weatherData?.kp_index?.history_24h?.length || 0,
        solar_wind_sample: weatherData?.solar_wind?.history_24h?.[0]
      });
      
      setData(weatherData);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching space weather:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpaceWeather();
    const interval = setInterval(fetchSpaceWeather, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatXrayFlux = (flux) => {
    if (!flux) return '0';
    return flux.toExponential(2);
  };

  const getFlareColor = (flux) => {
    if (flux >= 1e-4) return '#ff0000'; // X-class
    if (flux >= 1e-5) return '#ff6600'; // M-class
    if (flux >= 1e-6) return '#ffaa00'; // C-class
    return '#00ff88'; // A/B-class
  };

  const getSolarWindColor = (speed) => {
    if (speed > 750) return '#ff0000';
    if (speed > 600) return '#ff6600';
    if (speed > 450) return '#ffaa00';
    return '#00ff88';
  };

  const getKpColor = (kp) => {
    if (kp >= 7) return '#ff0000';
    if (kp >= 5) return '#ff6600';
    if (kp >= 4) return '#ffaa00';
    return '#00ff88';
  };

  const toggleCard = (cardName) => {
    setExpandedCard(expandedCard === cardName ? null : cardName);
  };

  if (loading) {
    return (
      <div className="space-weather-loading">
        <div className="spinner"></div>
        <p>Loading space weather data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-weather-error">
        <p>Error loading data: {error}</p>
        <button onClick={fetchSpaceWeather}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-weather-sidebar">
      <div className="weather-header">
        <h2>Space Weather</h2>
        <button className="refresh-btn" onClick={fetchSpaceWeather}>↻</button>
      </div>

      <div className="weather-stack">
        {/* Solar X-ray Flux Card */}
        <div className="weather-card">
          <div className="card-header">
            <h3>🌟 Solar X-ray</h3>
            <div className="current-value">
              <span className="value" style={{ color: getFlareColor(data?.xray_flux?.current?.flux || 0) }}>
                {data?.xray_flux?.current?.flare_class || 'A0'}
              </span>
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={data?.xray_flux?.history_6h || []}>
                <defs>
                  <linearGradient id="xrayGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff6600" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ff6600" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  stroke="#666"
                  style={{ fontSize: '8px' }}
                  tick={{ fontSize: 8 }}
                />
                <YAxis 
                  scale="log"
                  domain={[1e-9, 1e-3]}
                  tickFormatter={(val) => val.toExponential(0)}
                  stroke="#666"
                  style={{ fontSize: '8px' }}
                  tick={{ fontSize: 8 }}
                  width={35}
                />
                <Tooltip 
                  contentStyle={{ background: '#000', border: '1px solid #00ffff', fontSize: '10px' }}
                  labelFormatter={formatTime}
                  formatter={(value) => [formatXrayFlux(value), 'Flux']}
                />
                <Area 
                  type="monotone" 
                  dataKey="flux" 
                  stroke="#ff6600" 
                  strokeWidth={1.5}
                  fill="url(#xrayGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Solar Wind Speed Card */}
        <div className="weather-card">
          <div className="card-header">
            <h3>🌊 Solar Wind</h3>
            <div className="current-value">
              <span className="value" style={{ color: getSolarWindColor(data?.solar_wind?.current?.speed || 0) }}>
                {Math.round(data?.solar_wind?.current?.speed || 0)}
              </span>
              <span className="unit">km/s</span>
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={data?.solar_wind?.history_24h || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  stroke="#666"
                  style={{ fontSize: '8px' }}
                  tick={{ fontSize: 8 }}
                />
                <YAxis 
                  domain={[200, 'auto']}
                  stroke="#666"
                  style={{ fontSize: '8px' }}
                  tick={{ fontSize: 8 }}
                  width={35}
                />
                <Tooltip 
                  contentStyle={{ background: '#000', border: '1px solid #00ffff', fontSize: '10px' }}
                  labelFormatter={formatTime}
                  formatter={(value) => [`${Math.round(value)} km/s`, 'Speed']}
                />
                <Line 
                  type="monotone" 
                  dataKey="speed" 
                  stroke="#00ffff" 
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Planetary K-index Card */}
        <div className="weather-card">
          <div className="card-header">
            <h3>🌍 K-index</h3>
            <div className="current-value">
              <span className="value" style={{ color: getKpColor(data?.kp_index?.current?.kp || 0) }}>
                {data?.kp_index?.current?.kp?.toFixed(1) || '0.0'}
              </span>
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={(data?.kp_index?.history_24h || []).slice(-24)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  stroke="#666"
                  style={{ fontSize: '8px' }}
                  tick={{ fontSize: 8 }}
                />
                <YAxis 
                  domain={[0, 9]}
                  stroke="#666"
                  style={{ fontSize: '8px' }}
                  tick={{ fontSize: 8 }}
                  width={25}
                />
                <Tooltip 
                  contentStyle={{ background: '#000', border: '1px solid #00ffff', fontSize: '10px' }}
                  labelFormatter={formatTime}
                  formatter={(value) => [value.toFixed(1), 'Kp']}
                />
                <Bar 
                  dataKey="kp" 
                  fill="#00ffff"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpaceWeather;
