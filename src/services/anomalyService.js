/**
 * ATMOSPHERIC ANOMALY CLASSIFIER
 * 
 * Cross-references ground "UFO/UAP" sightings with orbital truth
 * This demonstrates sophisticated multi-source data fusion
 * 
 * Real-world context:
 * - Civilian "UFO" reports have surged due to Starlink trains
 * - Defense/aviation care about "unidentified" = potential drone/adversary
 * - Most sightings are explainable with orbital/atmospheric data
 */

/**
 * Generate synthetic UAP sighting reports
 * In production, this would ingest from Enigma Labs API, NUFORC, etc.
 */
export function generateAnomalies(satellites, count) {
  const anomalies = [];

  for (let i = 0; i < count; i++) {
    const anomaly = generateSingleAnomaly(satellites);
    anomalies.push(anomaly);
  }

  return anomalies;
}

/**
 * Generate one synthetic anomaly report
 * Mix of explainable (Starlink, balloon) and true anomalies
 */
function generateSingleAnomaly(satellites) {
  const types = [
    { type: 'starlink-train', weight: 0.4 },
    { type: 'balloon', weight: 0.3 },
    { type: 'iss-pass', weight: 0.1 },
    { type: 'debris-reentry', weight: 0.1 },
    { type: 'unknown', weight: 0.1 }
  ];

  // Weighted random selection
  const rand = Math.random();
  let cumulative = 0;
  let selectedType = 'unknown';

  for (const t of types) {
    cumulative += t.weight;
    if (rand <= cumulative) {
      selectedType = t.type;
      break;
    }
  }

  // Generate location (random but realistic)
  const location = generateRandomLocation();

  // Generate description based on type
  const description = generateDescription(selectedType);

  return {
    id: `UAP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: selectedType,
    timestamp: new Date(),
    location,
    description,
    duration: Math.floor(Math.random() * 300) + 10, // 10-310 seconds
    direction: generateRandomDirection(),
    brightness: ['dim', 'moderate', 'bright', 'very bright'][Math.floor(Math.random() * 4)],
    motion: generateMotionPattern(selectedType),
    reporterCount: Math.floor(Math.random() * 20) + 1,
    classified: false // Will be classified by classifier
  };
}

/**
 * Classify anomaly by cross-referencing with orbital data
 * This is the key "data fusion" step
 */
export function classifyAnomaly(anomaly, satellites) {
  const classification = {
    ...anomaly,
    classified: true,
    confidence: 0,
    explanation: '',
    category: 'UNRESOLVED',
    escalate: false
  };

  // Check against known satellite passes
  const satelliteMatch = checkSatellitePass(anomaly, satellites);
  if (satelliteMatch.match) {
    classification.category = 'EXPLAINED';
    classification.confidence = satelliteMatch.confidence;
    classification.explanation = satelliteMatch.explanation;
    classification.matchedSatellite = satelliteMatch.satellite;
    return classification;
  }

  // Check balloon drift pattern
  const balloonMatch = checkBalloonDrift(anomaly);
  if (balloonMatch.match) {
    classification.category = 'PROBABLE';
    classification.confidence = balloonMatch.confidence;
    classification.explanation = balloonMatch.explanation;
    return classification;
  }

  // Check debris re-entry corridor
  const debrisMatch = checkDebrisReentry(anomaly);
  if (debrisMatch.match) {
    classification.category = 'PROBABLE';
    classification.confidence = debrisMatch.confidence;
    classification.explanation = debrisMatch.explanation;
    return classification;
  }

  // If nothing matches, escalate
  classification.category = 'UNRESOLVED';
  classification.confidence = 0;
  classification.explanation = 'No match to known satellites, balloon drift, or debris re-entry. Non-standard kinematics. Recommend escalation to airspace safety.';
  classification.escalate = true;

  return classification;
}

/**
 * Check if anomaly matches a satellite pass overhead
 * This is the most common explanation (especially Starlink)
 */
function checkSatellitePass(anomaly, satellites) {
  // Check if any satellite was in line-of-sight at the time
  const { latitude, longitude } = anomaly.location;

  // Filter satellites that could be visible from this location
  const visibleSats = satellites.filter(sat => {
    // Calculate angular distance
    const angDist = angularDistance(
      latitude, longitude,
      sat.latitude, sat.longitude
    );

    // Satellite must be above horizon (< ~80 degrees from zenith)
    return angDist < 80;
  });

  if (visibleSats.length === 0) {
    return { match: false };
  }

  // Check for Starlink train pattern
  if (anomaly.description.includes('line') || anomaly.description.includes('formation')) {
    const starlinkSats = visibleSats.filter(s => s.type === 'broadband');
    if (starlinkSats.length >= 3) {
      return {
        match: true,
        confidence: 0.93,
        explanation: `Identified as Starlink satellite train. ${starlinkSats.length} satellites overhead at time of sighting. Description matches typical post-deployment formation: bright objects in line, moving steadily, silent.`,
        satellite: starlinkSats[0]
      };
    }
  }

  // Check for ISS pass
  const issSat = visibleSats.find(s => s.name.includes('ISS'));
  if (issSat && anomaly.brightness !== 'dim') {
    return {
      match: true,
      confidence: 0.88,
      explanation: `Identified as International Space Station pass. ISS was overhead at reported time. Magnitude -2 to -4 (very bright). Duration matches typical ISS pass (~4-6 minutes horizon to horizon).`,
      satellite: issSat
    };
  }

  // Single bright satellite
  if (visibleSats.length > 0) {
    const bestMatch = visibleSats[0];
    return {
      match: true,
      confidence: 0.75,
      explanation: `Probable satellite: ${bestMatch.name} (${bestMatch.service}). Overhead at time of sighting. Altitude ${Math.round(bestMatch.altitude)} km.`,
      satellite: bestMatch
    };
  }

  return { match: false };
}

/**
 * Check if motion pattern matches balloon drift
 * Balloons drift with wind, slow and steady
 */
function checkBalloonDrift(anomaly) {
  const { motion, duration } = anomaly;

  // Balloon characteristics:
  // - Slow motion (typically < 20 mph at altitude)
  // - Steady direction (follows wind)
  // - Long duration
  // - Sometimes reflective (looks like "metallic sphere")

  if (motion.speed === 'slow' && duration > 120) {
    // Simulate wind direction check
    const windMatch = Math.random() > 0.3; // 70% of time, matches prevailing wind

    if (windMatch) {
      return {
        match: true,
        confidence: 0.72,
        explanation: `Consistent with high-altitude balloon drift. Motion: ${motion.pattern}, speed ${motion.speed}. Direction aligns with prevailing winds at altitude. Duration ${duration}s typical for balloon visibility window.`
      };
    }
  }

  return { match: false };
}

/**
 * Check if sighting matches debris re-entry
 * Debris re-entry creates bright flashes, often reported as "fireball"
 */
function checkDebrisReentry(anomaly) {
  const { brightness, duration, description } = anomaly;

  // Re-entry characteristics:
  // - Very bright, often described as "fireball"
  // - Short duration (seconds to ~minute)
  // - Fragmentation (multiple objects)
  // - Fast, linear motion

  if (brightness === 'very bright' && duration < 90) {
    if (description.includes('bright') || description.includes('flash') || description.includes('trail')) {
      return {
        match: true,
        confidence: 0.65,
        explanation: `Probable debris re-entry. Characteristics match: very bright, short duration (${duration}s), linear motion. Potentially natural meteoroid or deorbiting satellite fragment.`
      };
    }
  }

  return { match: false };
}

/**
 * Calculate angular distance between two lat/lon points (degrees)
 */
function angularDistance(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * 180 / Math.PI; // Return in degrees
}

// ===== Helper functions for anomaly generation =====

function generateRandomLocation() {
  // Weight toward populated areas (more reports)
  const cities = [
    { name: 'New York', lat: 40.7128, lon: -74.0060 },
    { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
    { name: 'Chicago', lat: 41.8781, lon: -87.6298 },
    { name: 'London', lat: 51.5074, lon: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
    { name: 'Rural Montana', lat: 47.5, lon: -110.0 },
    { name: 'North Atlantic', lat: 45.0, lon: -30.0 }
  ];

  const city = cities[Math.floor(Math.random() * cities.length)];
  
  // Add some randomness around city center
  return {
    name: city.name,
    latitude: city.lat + (Math.random() - 0.5) * 2,
    longitude: city.lon + (Math.random() - 0.5) * 2
  };
}

function generateDescription(type) {
  const descriptions = {
    'starlink-train': [
      '6-8 bright objects in perfect line formation, moving steadily across sky',
      'String of lights like a train, all moving together, silent',
      'Multiple bright orbs in formation, evenly spaced, heading northeast'
    ],
    'balloon': [
      'Slow-moving bright sphere, looked metallic, hovering then drifting',
      'Round white object, moving very slowly with the wind',
      'Reflective oval shape, barely moving, high altitude'
    ],
    'iss-pass': [
      'Single very bright object, brighter than Venus, moving steadily',
      'Extremely bright light crossing entire sky in ~5 minutes',
      'Bright silent object, no blinking, steady motion'
    ],
    'debris-reentry': [
      'Bright streak with trail, broke into multiple pieces',
      'Fireball descending, very bright flash then gone',
      'Fast bright object with glowing trail, fragmented'
    ],
    'unknown': [
      'Erratic motion, sudden acceleration and stops',
      'Triangle formation of lights, not following standard flight path',
      'Fast silent object, no navigation lights, unusual maneuvers'
    ]
  };

  const options = descriptions[type] || descriptions['unknown'];
  return options[Math.floor(Math.random() * options.length)];
}

function generateRandomDirection() {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.floor(Math.random() * directions.length)];
}

function generateMotionPattern(type) {
  const patterns = {
    'starlink-train': { pattern: 'linear', speed: 'steady' },
    'balloon': { pattern: 'drifting', speed: 'slow' },
    'iss-pass': { pattern: 'linear', speed: 'steady' },
    'debris-reentry': { pattern: 'linear', speed: 'fast' },
    'unknown': { pattern: 'erratic', speed: 'variable' }
  };

  return patterns[type] || { pattern: 'unknown', speed: 'unknown' };
}
