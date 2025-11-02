import React, { useState } from 'react';
import './SatelliteLookup.css';

const SatelliteLookup = () => {
  const [noradId, setNoradId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!noradId || isNaN(noradId)) {
      setError('Please enter a valid NORAD ID');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch(`http://localhost:5000/api/satellite/${noradId}`);
      
      if (!response.ok) {
        throw new Error('Satellite not found');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getRiskColor = (score) => {
    if (score >= 70) return '#ff4444';
    if (score >= 40) return '#ffaa00';
    return '#44ff44';
  };

  const getRiskLabel = (score) => {
    if (score >= 70) return 'HIGH RISK';
    if (score >= 40) return 'MODERATE';
    return 'LOW RISK';
  };

  return (
    <div className="satellite-lookup">
      <div className="lookup-header">
        <h2>🛰️ Orbital Decay Analysis</h2>
        <p>Enter a NORAD ID to analyze decay predictions</p>
      </div>

      <div className="search-container">
        <input
          type="text"
          className="norad-input"
          placeholder="Enter NORAD ID (e.g., 25544 for ISS)"
          value={noradId}
          onChange={(e) => setNoradId(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
        <button 
          className="search-button"
          onClick={handleSearch}
          disabled={loading || !noradId}
        >
          {loading ? '⏳ Analyzing...' : '🔍 Analyze'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {data && (
        <div className="results-container">
          {/* Satellite Info */}
          <div className="info-card">
            <h3>{data.satellite_name}</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">NORAD ID:</span>
                <span className="value">{data.norad_id}</span>
              </div>
              <div className="info-item">
                <span className="label">Altitude:</span>
                <span className="value">{data.current_state.altitude_km.toFixed(2)} km</span>
              </div>
              <div className="info-item">
                <span className="label">Eccentricity:</span>
                <span className="value">{data.current_state.eccentricity.toFixed(6)}</span>
              </div>
              <div className="info-item">
                <span className="label">Inclination:</span>
                <span className="value">{data.current_state.inclination.toFixed(2)}°</span>
              </div>
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="risk-card">
            <div 
              className="risk-score"
              style={{ borderColor: getRiskColor(data.risk_assessment.risk_score) }}
            >
              <div className="risk-value" style={{ color: getRiskColor(data.risk_assessment.risk_score) }}>
                {data.risk_assessment.risk_score}
              </div>
              <div className="risk-label">
                {getRiskLabel(data.risk_assessment.risk_score)}
              </div>
            </div>
            <div className="risk-details">
              <p><strong>Confidence:</strong> {(data.risk_assessment.confidence * 100).toFixed(0)}%</p>
            </div>
          </div>

          {/* Model Predictions */}
          <div className="predictions-card">
            <h3>Decay Predictions</h3>
            <div className="predictions-table">
              <div className="prediction-row header">
                <span>Horizon</span>
                <span>Altitude Change</span>
                <span>Daily Rate</span>
                <span>Future Altitude</span>
              </div>
              {Object.entries(data.predictions).map(([key, pred]) => (
                <div key={key} className="prediction-row">
                  <span className="horizon">{key.replace('_', ' ')}</span>
                  <span className={pred.change_km < 0 ? 'negative' : 'positive'}>
                    {pred.change_km > 0 ? '+' : ''}{pred.change_km.toFixed(2)} km
                  </span>
                  <span className={pred.daily_rate_km < 0 ? 'negative' : 'positive'}>
                    {pred.daily_rate_km > 0 ? '+' : ''}{pred.daily_rate_km.toFixed(3)} km/day
                  </span>
                  <span>{pred.altitude_km.toFixed(2)} km</span>
                </div>
              ))}
            </div>
          </div>

          {/* Historical Decay Data */}
          {data.historical_data && data.historical_data.length > 0 && (
            <div className="historical-card">
              <h3>Historical Decay (Last 90 Days)</h3>
              
              {data.actual_decay_rate !== null && (
                <div className="comparison-box">
                  <div className="comparison-item">
                    <span className="label">📉 Observed Decay Rate:</span>
                    <span className={`value ${data.actual_decay_rate < 0 ? 'negative' : 'positive'}`}>
                      {data.actual_decay_rate > 0 ? '+' : ''}{data.actual_decay_rate.toFixed(3)} km/day
                    </span>
                  </div>
                  <div className="comparison-item">
                    <span className="label">📊 Total Altitude Loss:</span>
                    <span className="value negative">
                      {(data.historical_data[data.historical_data.length - 1].altitude_km - 
                       data.historical_data[0].altitude_km).toFixed(2)} km
                    </span>
                  </div>
                </div>
              )}

              <div className="historical-chart">
                <div className="chart-header">
                  <span>Altitude History ({data.historical_data.length} data points)</span>
                  <span>
                    Range: {Math.min(...data.historical_data.map(d => d.altitude_km)).toFixed(0)} - 
                    {Math.max(...data.historical_data.map(d => d.altitude_km)).toFixed(0)} km
                  </span>
                </div>
                <div className="mini-chart">
                  {data.historical_data.map((point, idx) => {
                    const maxAlt = Math.max(...data.historical_data.map(d => d.altitude_km));
                    const minAlt = Math.min(...data.historical_data.map(d => d.altitude_km));
                    const range = maxAlt - minAlt;
                    const height = range > 0 ? ((point.altitude_km - minAlt) / range) * 100 : 50;
                    
                    return (
                      <div 
                        key={idx} 
                        className="chart-bar"
                        style={{ height: `${height}%` }}
                        title={`${new Date(point.epoch).toLocaleDateString()}: ${point.altitude_km.toFixed(2)} km`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="data-summary">
                <p>
                  📅 Period: {new Date(data.historical_data[0].epoch).toLocaleDateString()} 
                  {' to '}
                  {new Date(data.historical_data[data.historical_data.length - 1].epoch).toLocaleDateString()}
                </p>
                <p>
                  � Data Points: {data.historical_data.length}
                </p>
              </div>
            </div>
          )}

          {/* Solar Conditions */}
          <div className="solar-card">
            <h3>☀️ Solar Conditions</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">F10.7 Solar Flux:</span>
                <span className="value">{data.solar_conditions.f107.toFixed(1)} sfu</span>
              </div>
              <div className="info-item">
                <span className="label">Observed:</span>
                <span className="value">
                  {data.solar_conditions.observed_time ? 
                    new Date(data.solar_conditions.observed_time).toLocaleString() : 
                    'Recent'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popular Satellites Quick Links */}
      {!data && !loading && (
        <div className="quick-links">
          <p className="quick-links-label">Popular satellites to analyze:</p>
          <div className="quick-buttons">
            <button onClick={() => { setNoradId('25544'); }} className="quick-btn">
              ISS (25544)
            </button>
            <button onClick={() => { setNoradId('56118'); }} className="quick-btn">
              Starlink-6105 (56118)
            </button>
            <button onClick={() => { setNoradId('48274'); }} className="quick-btn">
              Starlink-1600 (48274)
            </button>
            <button onClick={() => { setNoradId('43227'); }} className="quick-btn">
              Starlink-1113 (43227)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SatelliteLookup;
