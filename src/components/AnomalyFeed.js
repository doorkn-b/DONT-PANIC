import React from 'react';
import './AnomalyFeed.css';

/**
 * Anomaly feed showing classified UAP/UFO reports
 * Demonstrates cross-domain data fusion
 */
function AnomalyFeed({ anomalies }) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <div className="anomaly-feed">
        <h2>🛸 Anomaly Triage</h2>
        <p className="panel-subtitle">Ground sighting classification</p>
        <div className="no-anomalies">
          <p>No recent anomaly reports</p>
        </div>
      </div>
    );
  }

  return (
    <div className="anomaly-feed">
      <h2>🛸 Anomaly Triage</h2>
      <p className="panel-subtitle">Live ground sighting analysis</p>

      <div className="anomaly-list">
        {anomalies.map(anomaly => (
          <AnomalyCard key={anomaly.id} anomaly={anomaly} />
        ))}
      </div>

      <div className="triage-legend">
        <div className="legend-item">
          <span className="legend-icon explained">✓</span>
          <span className="legend-text">Explained - matched to known object</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon probable">⚠</span>
          <span className="legend-text">Probable - likely mundane</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon unresolved">🔴</span>
          <span className="legend-text">Unresolved - escalate</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual anomaly report card
 */
function AnomalyCard({ anomaly }) {
  const categoryClass = anomaly.category ? anomaly.category.toLowerCase() : 'unclassified';
  const icon = getCategoryIcon(anomaly.category);
  const confidence = anomaly.confidence ? (anomaly.confidence * 100).toFixed(0) : '0';

  return (
    <div className={`anomaly-card ${categoryClass}`}>
      <div className="anomaly-header">
        <span className={`category-icon ${categoryClass}`}>{icon}</span>
        <span className="anomaly-id">{anomaly.id}</span>
        {anomaly.escalate && <span className="escalate-badge">ESCALATE</span>}
      </div>

      <div className="anomaly-meta">
        <span className="meta-item">📍 {anomaly.location.name}</span>
        <span className="meta-item">🕐 {formatTimestamp(anomaly.timestamp)}</span>
      </div>

      <div className="anomaly-description">
        {anomaly.description}
      </div>

      {anomaly.classified && (
        <div className="classification">
          <div className="classification-header">
            <span className={`category-badge ${categoryClass}`}>
              {anomaly.category}
            </span>
            {anomaly.confidence > 0 && (
              <span className="confidence">
                {confidence}% confidence
              </span>
            )}
          </div>
          
          <div className="explanation">
            {anomaly.explanation}
          </div>

          {anomaly.matchedSatellite && (
            <div className="matched-satellite">
              <strong>Matched:</strong> {anomaly.matchedSatellite.name}
              {' '}({anomaly.matchedSatellite.service})
            </div>
          )}
        </div>
      )}

      {!anomaly.classified && (
        <div className="unclassified">
          <span className="spinner">⏳</span> Analyzing...
        </div>
      )}
    </div>
  );
}

// Helper functions

function getCategoryIcon(category) {
  const icons = {
    'EXPLAINED': '✓',
    'PROBABLE': '⚠',
    'UNRESOLVED': '🔴',
  };
  return icons[category] || '❓';
}

function formatTimestamp(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return then.toLocaleTimeString();
}

export default AnomalyFeed;
