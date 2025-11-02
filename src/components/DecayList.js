import React, { useState, useEffect } from 'react';
import './DecayList.css';

// Cache for API responses to prevent repeated calls
const decayCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * DecayList - Sidebar showing top 10 satellites at risk of decay
 */
function DecayList({ satellites, onSelectSatellite }) {
  const [decayingSatellites, setDecayingSatellites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchDecayData = async () => {
      // Only run once
      if (hasLoaded || !satellites || satellites.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const decayData = [];

      // Only check real satellites with valid NORAD IDs (ISS and known ones)
      // Avoid checking demo satellites with fake IDs
      const knownSatellites = [25544, 44713, 44714, 44715]; // ISS, Starlink-1, 2, 3
      const satellitesToCheck = satellites
        .filter(sat => sat.id && knownSatellites.includes(sat.id))
        .slice(0, 10); // Limit to 10 to avoid API spam

      console.log(`🔍 Checking ${satellitesToCheck.length} satellites for decay warnings...`);

      for (const sat of satellitesToCheck) {
        if (!isMounted) break;
        
        try {
          // Check cache first
          const cached = decayCache.get(sat.id);
          if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log(`📦 Using cached data for ${sat.name}`);
            if (cached.data) {
              decayData.push(cached.data);
            }
            continue;
          }

          const response = await fetch(`http://localhost:5000/api/satellite/${sat.id}`);
          if (response.ok) {
            const data = await response.json();
            
            // Check if decaying
            const pred90d = data.predictions['90_day'];
            const willDecaySoon = pred90d.altitude_km < 250 || pred90d.daily_rate_km < -0.5;
            
            const decayInfo = willDecaySoon ? {
              satellite: sat,
              name: data.satellite_name,
              noradId: sat.id,
              altitude: data.current_state.altitude_km,
              riskScore: data.risk_assessment.risk_score,
              dailyDecayRate: data.predictions['7_day'].daily_rate_km,
              daysUntilDecay: data.predictions['7_day'].daily_rate_km < 0 
                ? Math.max(0, (data.current_state.altitude_km - 150) / Math.abs(data.predictions['7_day'].daily_rate_km))
                : null,
              pred90d: pred90d.altitude_km
            } : null;

            // Cache the result
            decayCache.set(sat.id, {
              timestamp: Date.now(),
              data: decayInfo
            });

            if (decayInfo) {
              decayData.push(decayInfo);
            }
          }
        } catch (err) {
          // Skip satellites that fail
          console.warn(`Failed to fetch decay data for ${sat.name}:`, err.message);
          // Cache the failure
          decayCache.set(sat.id, {
            timestamp: Date.now(),
            data: null
          });
        }
        
        // Rate limit: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!isMounted) return;

      // Sort by days until decay (most urgent first)
      decayData.sort((a, b) => {
        if (a.daysUntilDecay === null) return 1;
        if (b.daysUntilDecay === null) return -1;
        return a.daysUntilDecay - b.daysUntilDecay;
      });

      console.log(`✅ Found ${decayData.length} satellites with decay warnings`);
      setDecayingSatellites(decayData.slice(0, 10));
      setLoading(false);
      setHasLoaded(true);
    };

    // Debounce: only fetch after satellites list is stable for 3 seconds
    const timeoutId = setTimeout(() => {
      fetchDecayData();
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [satellites, hasLoaded]);

  const handleSatelliteClick = (decayData) => {
    if (onSelectSatellite) {
      // Find the satellite index in the original satellites array
      const index = satellites.findIndex(sat => sat.id === decayData.noradId);
      if (index !== -1) {
        onSelectSatellite(index, {
          altitude: decayData.altitude,
          latitude: 0,
          longitude: 0,
          name: decayData.name
        }, decayData.satellite);
      }
    }
  };

  const getRiskColor = (riskScore) => {
    if (riskScore >= 70) return '#ff4444';
    if (riskScore >= 40) return '#ffaa44';
    return '#ffff44';
  };

  return (
    <div className={`decay-list-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Toggle Button */}
      <button 
        className="decay-list-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Show Decay List' : 'Hide Decay List'}
      >
        {collapsed ? '◀' : '▶'}
      </button>

      {!collapsed && (
        <div className="decay-list-content">
          {/* Header */}
          <div className="decay-list-header">
            <div className="decay-list-title">⚠️ TOP 10 DECAYING</div>
            <div className="decay-list-subtitle">Most At-Risk Satellites</div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="decay-list-loading">
              <div className="loading-spinner"></div>
              <div>Scanning satellites...</div>
            </div>
          )}

          {/* No Data State */}
          {!loading && decayingSatellites.length === 0 && (
            <div className="decay-list-empty">
              <div>✅ All satellites stable</div>
              <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
                No decay warnings detected
              </div>
            </div>
          )}

          {/* Satellite List */}
          {!loading && decayingSatellites.length > 0 && (
            <div className="decay-list-items">
              {decayingSatellites.map((data, index) => (
                <div 
                  key={data.noradId}
                  className="decay-list-item"
                  onClick={() => handleSatelliteClick(data)}
                  style={{ borderLeftColor: getRiskColor(data.riskScore) }}
                >
                  {/* Rank Badge */}
                  <div className="decay-rank" style={{ background: getRiskColor(data.riskScore) }}>
                    {index + 1}
                  </div>

                  {/* Satellite Info */}
                  <div className="decay-item-info">
                    <div className="decay-item-name">{data.name}</div>
                    <div className="decay-item-id">NORAD {data.noradId}</div>
                    
                    {/* Stats */}
                    <div className="decay-item-stats">
                      <div className="decay-stat">
                        <span className="stat-label">Days:</span>
                        <span className="stat-value" style={{ color: getRiskColor(data.riskScore) }}>
                          {data.daysUntilDecay ? Math.round(data.daysUntilDecay) : '?'}
                        </span>
                      </div>
                      <div className="decay-stat">
                        <span className="stat-label">Alt:</span>
                        <span className="stat-value">{Math.round(data.altitude)} km</span>
                      </div>
                      <div className="decay-stat">
                        <span className="stat-label">Risk:</span>
                        <span className="stat-value">{data.riskScore}/100</span>
                      </div>
                    </div>
                    
                    {/* Decay Rate */}
                    <div className="decay-item-rate">
                      {data.dailyDecayRate.toFixed(3)} km/day
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="decay-list-footer">
            Click any satellite to view details
          </div>
        </div>
      )}
    </div>
  );
}

export default DecayList;
