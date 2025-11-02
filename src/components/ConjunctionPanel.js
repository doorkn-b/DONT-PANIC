import React, { useState, useEffect } from 'react';
import './ConjunctionPanel.css';
import { simulateDebrisCascade, identifyAffectedSatellites } from '../services/conjunctionDetector';

/**
 * Left panel showing high-risk conjunctions and impact predictions
 */
function ConjunctionPanel({ conjunctions, satellites }) {
  const [selectedConjunction, setSelectedConjunction] = useState(null);
  const [countdown, setCountdown] = useState({});

  // Update countdowns every second
  useEffect(() => {
    const interval = setInterval(() => {
      const newCountdowns = {};
      conjunctions.forEach(conj => {
        const timeLeft = conj.timeToClosestApproach;
        newCountdowns[conj.id] = formatCountdown(timeLeft);
      });
      setCountdown(newCountdowns);
    }, 1000);

    return () => clearInterval(interval);
  }, [conjunctions]);

  if (conjunctions.length === 0) {
    return (
      <div className="conjunction-panel">
        <h2>Conjunction Monitor</h2>
        <div className="no-conjunctions">
          <div className="status-ok">✓</div>
          <p>No high-risk conjunctions detected in next 30 minutes</p>
          <p className="detail">Monitoring {satellites.length} objects</p>
        </div>
      </div>
    );
  }

  const handleConjunctionClick = (conj) => {
    setSelectedConjunction(conj);
  };

  return (
    <div className="conjunction-panel">
      <h2>⚠️ High-Risk Conjunctions</h2>
      <p className="panel-subtitle">
        Close approaches in next 30 minutes
      </p>

      <div className="conjunction-list">
        {conjunctions.map(conj => (
          <div
            key={conj.id}
            className={`conjunction-card ${conj.riskLevel.toLowerCase()}`}
            onClick={() => handleConjunctionClick(conj)}
          >
            <div className="conjunction-header">
              <span className="risk-badge">{conj.riskLevel}</span>
              <span className="countdown">{countdown[conj.id] || 'T-00:00'}</span>
            </div>

            <div className="conjunction-details">
              <div className="satellite-pair">
                <div className="sat-name">
                  <span className="sat-icon" style={{ color: conj.sat1.color }}>●</span>
                  {conj.sat1.name}
                </div>
                <div className="vs">⚡</div>
                <div className="sat-name">
                  <span className="sat-icon" style={{ color: conj.sat2.color }}>●</span>
                  {conj.sat2.name}
                </div>
              </div>

              <div className="metrics">
                <div className="metric">
                  <span className="metric-label">Miss Distance</span>
                  <span className="metric-value">
                    {conj.missDistance < 1 
                      ? `${Math.round(conj.missDistance * 1000)} m`
                      : `${conj.missDistance.toFixed(2)} km`
                    }
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Relative Velocity</span>
                  <span className="metric-value">{conj.relativeVelocity.toFixed(2)} km/s</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedConjunction && (
        <ImpactSimulation
          conjunction={selectedConjunction}
          satellites={satellites}
          onClose={() => setSelectedConjunction(null)}
        />
      )}
    </div>
  );
}

/**
 * Impact simulation panel - shows what happens if conjunction goes bad
 */
function ImpactSimulation({ conjunction, satellites, onClose }) {
  const debris = simulateDebrisCascade(conjunction);
  const affectedSats = identifyAffectedSatellites(debris, satellites);

  // Group affected satellites by service
  const serviceImpact = {};
  affectedSats.forEach(({ satellite }) => {
    const service = satellite.service || 'Unknown';
    if (!serviceImpact[service]) {
      serviceImpact[service] = [];
    }
    serviceImpact[service].push(satellite);
  });

  return (
    <div className="impact-simulation">
      <div className="impact-header">
        <h3>🔥 Debris Cascade Simulation</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="simulation-warning">
        <strong>IF THIS CONJUNCTION GOES BAD:</strong>
      </div>

      <div className="debris-stats">
        <div className="stat-item">
          <span className="stat-value">{debris.length}</span>
          <span className="stat-label">Debris Fragments</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{affectedSats.length}</span>
          <span className="stat-label">Satellites at Risk</span>
        </div>
      </div>

      <div className="service-impact">
        <h4>Earth Service Impact:</h4>
        {Object.keys(serviceImpact).length > 0 ? (
          Object.entries(serviceImpact).map(([service, sats]) => (
            <div key={service} className="service-card">
              <div className="service-name">{service}</div>
              <div className="service-detail">
                {sats.length} satellite{sats.length > 1 ? 's' : ''} affected
              </div>
              <div className="service-warning">
                {getServiceWarning(service)}
              </div>
            </div>
          ))
        ) : (
          <p className="no-impact">Limited immediate service impact detected</p>
        )}
      </div>

      {/* Special warnings for critical infrastructure */}
      {affectedSats.some(a => a.satellite.type === 'crewed') && (
        <div className="crew-warning">
          <strong>⚠️ CREW SAFETY ALERT</strong>
          <p>ISS or crewed vehicle in debris field. Emergency evacuation protocols may be needed.</p>
        </div>
      )}
    </div>
  );
}

// Helper functions

function formatCountdown(minutes) {
  const totalSeconds = Math.floor(minutes * 60);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `T-${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getServiceWarning(service) {
  const warnings = {
    'Starlink Broadband': 'Broadband outages in polar regions, maritime corridors. Rural connectivity at risk.',
    'GPS Navigation & Timing': 'GPS timing degradation. Impact on financial trading, power grid sync, precision agriculture.',
    'Weather Forecasting': 'Storm tracking blind spot. Aviation routing and severe weather warnings affected.',
    'ISS': 'Crew debris hazard elevated for next several orbits. Station may require emergency maneuver.',
    'Crewed Space Station': 'Immediate crew safety concern. Debris flux elevated in ISS orbital plane.'
  };

  return warnings[service] || 'Service continuity at risk. Monitoring for cascading failures.';
}

export default ConjunctionPanel;
