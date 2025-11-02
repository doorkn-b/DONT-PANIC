import React from 'react';
import './SpaceWeatherPanel.css';

/**
 * Space Weather panel showing live conditions and orbital shell stress
 */
function SpaceWeatherPanel({ spaceWeather, stressLayers }) {
  if (!spaceWeather) {
    return (
      <div className="space-weather-panel">
        <h2>Space Weather</h2>
        <p>Loading conditions...</p>
      </div>
    );
  }

  return (
    <div className="space-weather-panel">
      <h2>☀️ Space Weather</h2>
      <p className="panel-subtitle">Live solar-geomagnetic conditions</p>

      {/* Current conditions card */}
      <div className="weather-card">
        <div className="weather-status">
          <div className={`status-indicator ${spaceWeather.geomagneticStorm ? 'storm' : 'normal'}`}>
            {spaceWeather.geomagneticStorm ? '🌩️' : '☀️'}
          </div>
          <div className="status-text">
            <div className="condition">{spaceWeather.condition}</div>
            {spaceWeather.stormLevel && (
              <div className="storm-level">{spaceWeather.stormLevel}</div>
            )}
          </div>
        </div>

        <div className="weather-metrics">
          <div className="weather-metric">
            <span className="metric-label">Kp Index</span>
            <span className="metric-value kp-value">
              {spaceWeather.kpIndex.toFixed(1)}
              <span className="metric-trend">{getTrendIcon(spaceWeather.kpTrend)}</span>
            </span>
          </div>
          
          <div className="weather-metric">
            <span className="metric-label">Solar Wind</span>
            <span className="metric-value">{Math.round(spaceWeather.solarWindSpeed)} km/s</span>
          </div>

          <div className="weather-metric">
            <span className="metric-label">Atmospheric Density</span>
            <span className="metric-value density-mult">
              {spaceWeather.atmosphericDensityMultiplier.toFixed(1)}× baseline
            </span>
          </div>
        </div>

        {/* Physics explanation */}
        {spaceWeather.geomagneticStorm && (
          <div className="weather-impact">
            <strong>Impact:</strong> Geomagnetic storm heating upper atmosphere. 
            LEO drag increased {spaceWeather.atmosphericDensityMultiplier.toFixed(1)}× normal. 
            Satellites losing altitude faster than planned, requiring emergency burns.
          </div>
        )}
      </div>

      {/* Alerts */}
      {spaceWeather.alerts && spaceWeather.alerts.length > 0 && (
        <div className="alerts-section">
          <h3>⚠️ Active Alerts</h3>
          {spaceWeather.alerts.map((alert, idx) => (
            <div key={idx} className="alert-card">
              <div className="alert-type">{alert.type}</div>
              <div className="alert-desc">{alert.description}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orbital shell stress levels */}
      <div className="stress-layers-section">
        <h3>🛰️ Orbital Shell Stress</h3>
        <p className="stress-subtitle">Environmental pressure by altitude band</p>

        {stressLayers.map((layer, idx) => (
          <div key={idx} className="stress-layer-card">
            <div className="layer-header">
              <div className="layer-name">{layer.name}</div>
              <div className={`stress-badge ${layer.stressLevel.toLowerCase()}`}>
                {layer.stressLevel}
              </div>
            </div>

            <div className="layer-altitude">
              {layer.centerAltitude.toLocaleString()} km altitude
            </div>

            <div className="stress-bars">
              <div className="stress-bar-item">
                <span className="bar-label">Drag</span>
                <div className="bar-container">
                  <div
                    className="bar-fill drag"
                    style={{ width: `${layer.dragStress}%` }}
                  />
                </div>
                <span className="bar-value">{Math.round(layer.dragStress)}%</span>
              </div>

              <div className="stress-bar-item">
                <span className="bar-label">Radiation</span>
                <div className="bar-container">
                  <div
                    className="bar-fill radiation"
                    style={{ width: `${layer.radiationStress}%` }}
                  />
                </div>
                <span className="bar-value">{Math.round(layer.radiationStress)}%</span>
              </div>

              <div className="stress-bar-item">
                <span className="bar-label">Tracking</span>
                <div className="bar-container">
                  <div
                    className="bar-fill tracking"
                    style={{ width: `${layer.trackingDegradation}%` }}
                  />
                </div>
                <span className="bar-value">{Math.round(layer.trackingDegradation)}%</span>
              </div>
            </div>

            {/* Show impacts if stressed */}
            {layer.impact && layer.impact.length > 0 && (
              <div className="layer-impacts">
                {layer.impact.map((impact, impactIdx) => (
                  <div key={impactIdx} className={`impact-item ${impact.severity}`}>
                    <span className="impact-icon">⚠️</span>
                    <span className="impact-text">{impact.description}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Show affected services */}
            {layer.services && layer.services.length > 0 && (
              <div className="affected-services">
                {layer.services.map((service, sIdx) => (
                  <div key={sIdx} className="service-item">
                    <span className="service-icon">{service.icon}</span>
                    <div className="service-info">
                      <div className="service-name">{service.name}</div>
                      <div className="service-impact">{service.impact}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function getTrendIcon(trend) {
  if (trend === 'rising') return '↗';
  if (trend === 'falling') return '↘';
  return '→';
}

export default SpaceWeatherPanel;
