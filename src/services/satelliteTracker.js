// Satellite tracking service using N2YO API
import * as satellite from 'satellite.js';

// N2YO API configuration
const N2YO_API_KEY = '2DG2C5-XDWT8L-HHFGUQ-5LH2'; // Replace with your actual API key
const N2YO_BASE_URL = 'https://api.n2yo.com/rest/v1/satellite';

// Observer location (default: somewhere in US)
const OBSERVER = {
  lat: 41.702,
  lng: -76.014,
  alt: 0
};

/**
 * Fetch satellites above a location using N2YO API
 */
export async function fetchSatellitesAbove() {
  try {
    // Fetch different categories
    const categories = [
      2,  // ISS
      52, // Starlink
      50, // GPS
      1,  // Brightest
    ];

    const allSatellites = [];

    for (const categoryId of categories) {
      try {
        const url = `${N2YO_BASE_URL}/above/${OBSERVER.lat}/${OBSERVER.lng}/${OBSERVER.alt}/90/${categoryId}/&apiKey=${N2YO_API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn(`Failed to fetch category ${categoryId}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.above && data.above.length > 0) {
          // Fetch TLE for each satellite
          for (const sat of data.above) {
            try {
              const tleUrl = `${N2YO_BASE_URL}/tle/${sat.satid}&apiKey=${N2YO_API_KEY}`;
              const tleResponse = await fetch(tleUrl);
              
              if (tleResponse.ok) {
                const tleData = await tleResponse.json();
                const [line1, line2] = tleData.tle.split('\r\n');
                const satrec = satellite.twoline2satrec(line1, line2);
                
                allSatellites.push({
                  name: sat.satname,
                  id: sat.satid,
                  tleLine1: line1,
                  tleLine2: line2,
                  satrec,
                });
              }
            } catch (err) {
              // Skip this satellite
            }
          }
        }
      } catch (err) {
        console.warn(`Error fetching category ${categoryId}:`, err);
      }
    }

    console.log(`Fetched ${allSatellites.length} satellites from N2YO`);
    return allSatellites.slice(0, 200); // Limit to 200 for performance
  } catch (error) {
    console.error('Error fetching satellites:', error);
    return getDemoSatellites();
  }
}

/**
 * Fetch real satellite data from backend proxy
 */
export async function fetchSatelliteTLEs(limits = {}) {
  try {
    console.log('🛰️ Fetching real satellite data from backend proxy...');
    console.log('📊 Using limits:', limits);
    
    // Build query string from limits
    const params = new URLSearchParams(limits).toString();
    const url = `http://localhost:3001/api/satellites${params ? '?' + params : ''}`;
    console.log('🔗 Fetching from:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.satellites && data.satellites.length > 0) {
      console.log(`✅ Loaded ${data.satellites.length} real satellites from N2YO API`);
      
      // Convert to demo mode format - EXACTLY like demo satellites
      const satellites = data.satellites.map((sat, index) => {
        try {
          const satrec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
          
          // Extract ONLY inclination and mean motion from TLE
          const inclination = satrec.inclo * (180 / Math.PI); // radians to degrees
          
          // Calculate altitude from mean motion (revs per day)
          // Mean motion is in radians per minute, convert to get altitude
          const meanMotion = satrec.no; // radians per minute
          const period = (2 * Math.PI) / meanMotion; // orbital period in minutes
          const n = 86400 / (period * 60); // revs per day
          const a = Math.pow(398600.4418 / Math.pow(2 * Math.PI * n / 86400, 2), 1/3); // semi-major axis in km
          const altitude = a - 6371; // altitude above Earth surface
          
          // Use random starting position
          const longitude = (index * 3.6) % 360 - 180; // Distribute evenly
          const phase = (index * 0.1) % (Math.PI * 2); // Random phase
          
          // Return in EXACT demo satellite format
          return {
            name: sat.name,
            id: sat.id,
            noradId: sat.id,
            type: sat.category || 'satellite',
            category: sat.category,
            isDemoMode: true,
            inclination: inclination,
            altitude: altitude,
            longitude: longitude,
            phase: phase,
            color: '#00ffff',
            size: 'small'
          };
        } catch (err) {
          console.warn(`Failed to parse TLE for ${sat.name}`);
          return null;
        }
      }).filter(sat => sat !== null);
      
      return satellites;
    }
    
    throw new Error('No satellites returned from backend');
  } catch (error) {
    console.warn('⚠️ Backend proxy not available, using demo satellites:', error.message);
    console.log('💡 Start backend with: cd backend && node server-simple.js');
    return getDemoSatellites();
  }
}

/**
 * Parse TLE format data
 */
function parseTLE(tleText) {
  const lines = tleText.split('\n').filter(line => line.trim());
  const satellites = [];

  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i].trim();
    const tleLine1 = lines[i + 1];
    const tleLine2 = lines[i + 2];

    if (tleLine1.startsWith('1 ') && tleLine2.startsWith('2 ')) {
      try {
        const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
        satellites.push({
          name,
          tleLine1,
          tleLine2,
          satrec,
        });
      } catch (err) {
        // Skip invalid TLE
      }
    }
  }

  return satellites;
}

/**
 * Calculate current satellite position
 */
export function getSatellitePosition(sat, time = Date.now()) {
  // Demo mode - use realistic orbital simulation
  if (sat.isDemoMode) {
    const t = time / 1000; // Convert to seconds
    
    // Geostationary satellites don't move relative to Earth
    if (sat.geostationary) {
      return {
        latitude: 0,
        longitude: sat.longitude,
        altitude: sat.altitude,
        type: sat.type,
        color: sat.color,
        size: sat.size
      };
    }
    
    // Orbital speed based on altitude (Kepler's laws approximation)
    const orbitRadius = 6371 + sat.altitude; // Earth radius + altitude
    const speed = Math.sqrt(398600 / orbitRadius) / orbitRadius; // Simplified orbital speed
    
    // Calculate position on orbit
    const angle = sat.phase + t * speed;
    const inclination = sat.inclination * Math.PI / 180;
    
    // Circular orbit with proper inclination
    const latitude = Math.asin(Math.sin(inclination) * Math.sin(angle)) * 180 / Math.PI;
    const longitude = ((sat.longitude + angle * 180 / Math.PI) % 360);
    
    return {
      latitude,
      longitude: longitude > 180 ? longitude - 360 : longitude,
      altitude: sat.altitude,
      type: sat.type,
      color: sat.color,
      size: sat.size
    };
  }
  
  // Real TLE mode
  const now = new Date(time);
  const positionAndVelocity = satellite.propagate(sat.satrec, now);

  if (positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
    const positionEci = positionAndVelocity.position;
    
    // Convert ECI to geographic coordinates
    const gmst = satellite.gstime(now);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);

    return {
      latitude: satellite.degreesLat(positionGd.latitude),
      longitude: satellite.degreesLong(positionGd.longitude),
      altitude: positionGd.height,
      x: positionEci.x,
      y: positionEci.y,
      z: positionEci.z
    };
  }

  return null;
}

/**
 * Convert lat/lon/alt to Cartesian coordinates for Three.js
 * Properly aligned with Earth texture
 * 
 * COORDINATE SYSTEM:
 * - Three.js: Y-up, right-handed coordinate system
 * - Earth sphere: radius = 2 units
 * - Texture: Standard equirectangular map (lat/lon grid)
 * 
 * ALIGNMENT RULES:
 * - Latitude 90° (North Pole) = +Y axis (top)
 * - Latitude -90° (South Pole) = -Y axis (bottom)
 * - Longitude 0° (Prime Meridian) = +Z axis (front, facing camera initially)
 * - Longitude 90°E = +X axis (right)
 * - Longitude -90°W = -X axis (left)
 * - Longitude 180° = -Z axis (back)
 * 
 * The Earth mesh has rotation [0, PI, 0] to align texture correctly
 */
export function latLonAltToCartesian(lat, lon, alt, earthRadius = 2) {
  // Add altitude directly to radius (no scaling)
  const radius = earthRadius + (alt / 6371);
  
  // Convert to radians  
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  
  // Three.js SphereGeometry default UV mapping:
  // lon 0° is at -Z, lon 90° is at +X, lon 180° is at +Z, lon -90° is at -X
  // lat 90° is at +Y (North Pole), lat -90° is at -Y (South Pole)
  const x = -radius * Math.cos(latRad) * Math.sin(lonRad);
  const y = radius * Math.sin(latRad);
  const z = -radius * Math.cos(latRad) * Math.cos(lonRad);

  return { x, y, z };
}

/**
 * DEBUG: Get test positions for verifying Earth alignment
 * Use this to place visual markers and check if they align with texture
 */
export function getTestPositions() {
  return [
    { name: 'North Pole', lat: 90, lon: 0, alt: 0 },
    { name: 'South Pole', lat: -90, lon: 0, alt: 0 },
    { name: 'Prime Meridian (0°, 0°)', lat: 0, lon: 0, alt: 0 },
    { name: 'Equator 90°E', lat: 0, lon: 90, alt: 0 },
    { name: 'Equator 180°', lat: 0, lon: 180, alt: 0 },
    { name: 'Equator -90°W', lat: 0, lon: -90, alt: 0 },
    { name: 'ISS typical', lat: 45, lon: 30, alt: 420 }
  ];
}

/**
 * Get detailed metadata for satellite types
 */
function getSatelliteMetadata(type, name) {
  const metadata = {
    'ISS': {
      fullName: 'International Space Station',
      operator: 'NASA/Roscosmos/ESA/JAXA/CSA',
      purpose: 'Human spaceflight and scientific research',
      launchDate: '1998-11-20',
      mass: '419,725 kg',
      country: 'International',
      orbitalPeriod: '92.9 min',
      image: '🛰️'
    },
    'starlink': {
      fullName: 'Starlink Communications Satellite',
      operator: 'SpaceX',
      purpose: 'Global broadband internet coverage',
      launchDate: '2019-2024',
      mass: '260 kg',
      country: 'USA',
      orbitalPeriod: '95 min',
      image: '📡'
    },
    'gps': {
      fullName: 'Global Positioning System Satellite',
      operator: 'US Space Force',
      purpose: 'Navigation and precise timing',
      launchDate: '1989-2023',
      mass: '2,032 kg',
      country: 'USA',
      orbitalPeriod: '11h 58min',
      image: '🛰️'
    },
    'oneweb': {
      fullName: 'OneWeb Communications Satellite',
      operator: 'OneWeb',
      purpose: 'Global internet connectivity',
      launchDate: '2019-2024',
      mass: '147 kg',
      country: 'UK',
      orbitalPeriod: '109 min',
      image: '📡'
    },
    'polar': {
      fullName: 'Polar Observation Satellite',
      operator: 'Various',
      purpose: 'Earth observation and imaging',
      launchDate: '2010-2024',
      mass: '500-800 kg',
      country: 'International',
      orbitalPeriod: '98 min',
      image: '🛰️'
    },
    'geo': {
      fullName: 'Geostationary Communications Satellite',
      operator: 'Various',
      purpose: 'Broadcasting and telecommunications',
      launchDate: '2005-2024',
      mass: '3,000-6,000 kg',
      country: 'International',
      orbitalPeriod: '23h 56min',
      image: '📡'
    },
    'weather': {
      fullName: 'Weather Observation Satellite',
      operator: 'NOAA/EUMETSAT',
      purpose: 'Meteorological monitoring and forecasting',
      launchDate: '2010-2024',
      mass: '1,440 kg',
      country: 'USA/Europe',
      orbitalPeriod: '101 min',
      image: '🌤️'
    },
    'communications': {
      fullName: 'Communications Satellite',
      operator: 'Various Commercial',
      purpose: 'Telecommunications and data relay',
      launchDate: '2015-2024',
      mass: '2,500 kg',
      country: 'International',
      orbitalPeriod: '110 min',
      image: '📡'
    }
  };
  
  return metadata[type] || metadata['communications'];
}

/**
 * Demo satellites - generates realistic orbiting satellites
 */
function getDemoSatellites() {
  console.log('🛰️ Loading demo satellites with realistic orbits');
  
  const demoSats = [];
  
  // ISS-like orbit (1 satellite)
  const issMetadata = getSatelliteMetadata('ISS', 'ISS');
  demoSats.push({
    name: 'ISS',
    id: 25544,
    noradId: 25544,
    type: 'ISS',
    isDemoMode: true,
    inclination: 51.6,
    altitude: 420,
    longitude: 0,
    phase: 0,
    color: '#ffff00',
    size: 'large',
    ...issMetadata
  });
  
  // Starlink constellation (200 satellites in LEO) - Doubled
  const starlinkMetadata = getSatelliteMetadata('starlink');
  for (let i = 0; i < 200; i++) {
    const noradId = 44000 + i;
    demoSats.push({
      name: `Starlink-${i + 1}`,
      id: noradId,
      noradId: noradId,
      type: 'starlink',
      isDemoMode: true,
      inclination: 53 + Math.random() * 10,
      altitude: 540 + Math.random() * 20,
      longitude: (i * 1.8) % 360 - 180,
      phase: (i * 0.05) % (Math.PI * 2),
      color: '#00ffff',
      size: 'small',
      ...starlinkMetadata
    });
  }
  
  // GPS satellites (32 in MEO) - Increased
  const gpsMetadata = getSatelliteMetadata('gps');
  for (let i = 0; i < 32; i++) {
    demoSats.push({
      name: `GPS-${i + 1}`,
      type: 'gps',
      isDemoMode: true,
      inclination: 55,
      altitude: 20200,
      longitude: (i * 11.25) % 360 - 180,
      phase: (i * Math.PI / 16),
      color: '#00ff00',
      size: 'medium',
      ...gpsMetadata
    });
  }
  
  // OneWeb constellation (50 satellites in LEO) - New
  const onewebMetadata = getSatelliteMetadata('oneweb');
  for (let i = 0; i < 50; i++) {
    demoSats.push({
      name: `OneWeb-${i + 1}`,
      type: 'oneweb',
      isDemoMode: true,
      inclination: 87.9,
      altitude: 1200,
      longitude: (i * 7.2) % 360 - 180,
      phase: (i * 0.12) % (Math.PI * 2),
      color: '#ff1493',
      size: 'small',
      ...onewebMetadata
    });
  }
  
  // Polar satellites (40) - Doubled
  const polarMetadata = getSatelliteMetadata('polar');
  for (let i = 0; i < 40; i++) {
    demoSats.push({
      name: `Polar-${i + 1}`,
      type: 'polar',
      isDemoMode: true,
      inclination: 90 + Math.random() * 8,
      altitude: 700 + Math.random() * 200,
      longitude: (i * 9) % 360 - 180,
      phase: (i * Math.PI / 20),
      color: '#9370db',
      size: 'small',
      ...polarMetadata
    });
  }
  
  // Geostationary (15) - Tripled
  const geoMetadata = getSatelliteMetadata('geo');
  for (let i = 0; i < 15; i++) {
    demoSats.push({
      name: `GEO-${i + 1}`,
      type: 'geo',
      isDemoMode: true,
      inclination: 0,
      altitude: 35786,
      longitude: (i * 24) - 180,
      phase: 0,
      color: '#ff8800',
      size: 'medium',
      geostationary: true,
      ...geoMetadata
    });
  }
  
  // Weather satellites (20) - New
  const weatherMetadata = getSatelliteMetadata('weather');
  for (let i = 0; i < 20; i++) {
    demoSats.push({
      name: `Weather-${i + 1}`,
      type: 'weather',
      isDemoMode: true,
      inclination: 98 + Math.random() * 2,
      altitude: 800 + Math.random() * 100,
      longitude: (i * 18) % 360 - 180,
      phase: (i * Math.PI / 10),
      color: '#00bfff',
      size: 'small',
      ...weatherMetadata
    });
  }
  
  // Communications satellites (30) - New
  const commsMetadata = getSatelliteMetadata('communications');
  for (let i = 0; i < 30; i++) {
    demoSats.push({
      name: `Comms-${i + 1}`,
      type: 'communications',
      isDemoMode: true,
      inclination: 28 + Math.random() * 15,
      altitude: 1400 + Math.random() * 400,
      longitude: (i * 12) % 360 - 180,
      phase: (i * Math.PI / 15),
      color: '#ff69b4',
      size: 'small',
      ...commsMetadata
    });
  }
  
  console.log(`✅ Loaded ${demoSats.length} demo satellites`);
  return demoSats;
}
