import axios from 'axios';
import * as satellite from 'satellite.js';

// This service fetches and processes live satellite data
// Data sources: CelesTrak TLEs, N2YO API fallback

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
// const N2YO_API_KEY = 'YOUR_API_KEY'; // Replace with actual key if using N2YO
// const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';

/**
 * Fetches TLE data from CelesTrak for a specific group
 */
async function fetchTLEFromCelesTrak(groupName) {
  try {
    const url = `${CELESTRAK_BASE}?GROUP=${groupName}&FORMAT=TLE`;
    const response = await axios.get(url);
    return parseTLEData(response.data);
  } catch (error) {
    console.error(`Error fetching TLEs for ${groupName}:`, error);
    return [];
  }
}

/**
 * Parse TLE string data into structured satellite objects
 * TLE format: Line 0 (name), Line 1 (orbital elements), Line 2 (orbital elements)
 */
function parseTLEData(tleString) {
  const lines = tleString.trim().split('\n');
  const satellites = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 >= lines.length) break;

    const name = lines[i].trim();
    const tleLine1 = lines[i + 1].trim();
    const tleLine2 = lines[i + 2].trim();

    try {
      // Parse TLE using satellite.js
      const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
      
      // Calculate current position
      const now = new Date();
      const positionAndVelocity = satellite.propagate(satrec, now);
      
      if (positionAndVelocity.position && !positionAndVelocity.position.x === false) {
        const gmst = satellite.gstime(now);
        const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
        
        satellites.push({
          name,
          tleLine1,
          tleLine2,
          satrec,
          position: positionAndVelocity.position, // ECI coordinates (km)
          velocity: positionAndVelocity.velocity, // ECI velocity (km/s)
          altitude: positionGd.height, // km above Earth
          latitude: positionGd.latitude * (180 / Math.PI),
          longitude: positionGd.longitude * (180 / Math.PI),
          timestamp: now
        });
      }
    } catch (error) {
      console.warn(`Failed to parse TLE for ${name}:`, error);
    }
  }

  return satellites;
}

/**
 * Fetch ISS position from Open-Notify API (backup/validation)
 */
async function fetchISSPosition() {
  try {
    const response = await axios.get('http://api.open-notify.org/iss-now.json');
    return {
      name: 'ISS',
      latitude: parseFloat(response.data.iss_position.latitude),
      longitude: parseFloat(response.data.iss_position.longitude),
      altitude: 408, // ISS typical altitude in km
      type: 'crewed',
      timestamp: new Date(response.data.timestamp * 1000)
    };
  } catch (error) {
    console.error('Error fetching ISS position:', error);
    return null;
  }
}

/**
 * Main function: Fetch live satellite data from multiple sources
 * Returns array of satellite objects with positions, velocities, and metadata
 */
export async function fetchLiveSatelliteData() {
  try {
    console.log('Fetching live satellite data...');
    
    // Fetch different satellite groups in parallel
    const fetchPromises = [
      fetchTLEFromCelesTrak('starlink'),
      fetchTLEFromCelesTrak('gps-ops'),
      fetchTLEFromCelesTrak('weather'),
      fetchTLEFromCelesTrak('stations'), // ISS
      fetchISSPosition()
    ];

    const results = await Promise.all(fetchPromises);
    
    // Flatten and categorize
    let allSatellites = [];
    
    // Starlink (limit to 100 for performance)
    const starlink = results[0].slice(0, 100).map(sat => ({
      ...sat,
      type: 'broadband',
      color: '#00ffff',
      service: 'Starlink Broadband'
    }));
    
    // GPS
    const gps = results[1].map(sat => ({
      ...sat,
      type: 'navigation',
      color: '#ffaa00',
      service: 'GPS Navigation & Timing'
    }));
    
    // Weather
    const weather = results[2].slice(0, 20).map(sat => ({
      ...sat,
      type: 'weather',
      color: '#00ff00',
      service: 'Weather Forecasting'
    }));
    
    // ISS and stations
    const stations = results[3].map(sat => ({
      ...sat,
      type: 'crewed',
      color: '#ff0000',
      service: 'Crewed Space Station'
    }));

    // ISS from Open-Notify (backup)
    if (results[4]) {
      stations.push({
        ...results[4],
        color: '#ff0000',
        service: 'ISS'
      });
    }

    allSatellites = [...starlink, ...gps, ...weather, ...stations];

    // Add synthetic debris for demonstration (in real system, use Space-Track.org)
    const debris = generateSyntheticDebris(20);
    allSatellites = [...allSatellites, ...debris];

    console.log(`Loaded ${allSatellites.length} satellites:`, {
      starlink: starlink.length,
      gps: gps.length,
      weather: weather.length,
      stations: stations.length,
      debris: debris.length
    });

    return allSatellites;
  } catch (error) {
    console.error('Error in fetchLiveSatelliteData:', error);
    
    // Return demo data as fallback
    return generateDemoSatellites();
  }
}

/**
 * Generate synthetic debris objects for demonstration
 * In production, use Space-Track.org debris catalog
 */
function generateSyntheticDebris(count) {
  const debris = [];
  
  for (let i = 0; i < count; i++) {
    // Random LEO altitude (300-800 km)
    const altitude = 300 + Math.random() * 500;
    
    debris.push({
      name: `DEBRIS-${1000 + i}`,
      type: 'debris',
      color: '#ff00ff',
      altitude,
      latitude: (Math.random() - 0.5) * 180,
      longitude: (Math.random() - 0.5) * 360,
      service: 'Space Debris',
      timestamp: new Date()
    });
  }
  
  return debris;
}

/**
 * Fallback: Generate demo satellite data for testing without API
 */
function generateDemoSatellites() {
  const demo = [];
  
  // Demo ISS
  demo.push({
    name: 'ISS (DEMO)',
    type: 'crewed',
    color: '#ff0000',
    altitude: 408,
    latitude: 51.6,
    longitude: 0,
    service: 'International Space Station',
    timestamp: new Date()
  });

  // Demo Starlink constellation (circular shell at 550km)
  for (let i = 0; i < 50; i++) {
    const angle = (i / 50) * 2 * Math.PI;
    demo.push({
      name: `STARLINK-${i + 1000}`,
      type: 'broadband',
      color: '#00ffff',
      altitude: 550,
      latitude: Math.sin(angle) * 53, // 53° inclination typical for Starlink
      longitude: (angle * 180 / Math.PI) % 360 - 180,
      service: 'Starlink Broadband',
      timestamp: new Date()
    });
  }

  // Demo GPS satellites (MEO at ~20,000 km)
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * 2 * Math.PI;
    demo.push({
      name: `GPS-${i + 1}`,
      type: 'navigation',
      color: '#ffaa00',
      altitude: 20180,
      latitude: Math.sin(angle) * 55,
      longitude: (angle * 180 / Math.PI) % 360 - 180,
      service: 'GPS Navigation & Timing',
      timestamp: new Date()
    });
  }

  console.log('Using DEMO satellite data (API fetch failed or offline)');
  return demo;
}

/**
 * Propagate satellite position forward in time
 * Uses SGP4 propagator for accurate orbital mechanics
 */
export function propagateSatellite(sat, minutesAhead) {
  if (!sat.satrec) return null;

  const futureTime = new Date(sat.timestamp.getTime() + minutesAhead * 60000);
  const positionAndVelocity = satellite.propagate(sat.satrec, futureTime);

  if (positionAndVelocity.position) {
    return {
      position: positionAndVelocity.position,
      velocity: positionAndVelocity.velocity,
      timestamp: futureTime
    };
  }

  return null;
}
