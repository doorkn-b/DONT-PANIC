import { propagateSatellite } from './satelliteService';

/**
 * CONJUNCTION DETECTION ENGINE
 * 
 * Detects high-risk close approaches between satellites and debris
 * Uses physics-based orbital propagation and 3D closest-approach calculation
 * 
 * Real operators (Starlink, ESA) report >50,000 avoidance maneuvers per 6 months
 * Threshold: typically <1 km miss distance triggers evasion decision
 */

const EARTH_RADIUS_KM = 6371;
const HIGH_RISK_THRESHOLD_KM = 1.0; // Miss distance below this = high risk
const PREDICTION_HORIZON_MINUTES = 30; // Look ahead 30 minutes
const TIME_STEPS = 30; // Check every minute

/**
 * Main conjunction detection function
 * Checks all satellite pairs for close approaches in next 30 minutes
 */
export function detectConjunctions(satellites) {
  console.log(`Running conjunction detection on ${satellites.length} objects...`);
  
  const conjunctions = [];
  const now = Date.now();

  // Only check satellites with valid orbital data (not demo objects)
  const trackableSats = satellites.filter(sat => sat.satrec || sat.altitude);

  // Pairwise comparison - O(n²) but necessary for accurate collision detection
  for (let i = 0; i < trackableSats.length; i++) {
    for (let j = i + 1; j < trackableSats.length; j++) {
      const sat1 = trackableSats[i];
      const sat2 = trackableSats[j];

      // Optimization: Skip if altitude difference > 100 km
      // (objects can't collide if they're in very different shells)
      if (Math.abs(sat1.altitude - sat2.altitude) > 100) {
        continue;
      }

      // Find closest approach in prediction horizon
      const closestApproach = findClosestApproach(sat1, sat2);

      if (closestApproach && closestApproach.missDistance < HIGH_RISK_THRESHOLD_KM) {
        conjunctions.push({
          sat1,
          sat2,
          ...closestApproach,
          riskLevel: getRiskLevel(closestApproach.missDistance, closestApproach.relativeVelocity),
          id: `${sat1.name}-${sat2.name}-${now}`
        });
      }
    }
  }

  // Sort by time to closest approach (most urgent first)
  conjunctions.sort((a, b) => a.timeToClosestApproach - b.timeToClosestApproach);

  console.log(`Detected ${conjunctions.length} high-risk conjunctions`);
  return conjunctions.slice(0, 5); // Return top 5 most urgent
}

/**
 * Find closest approach between two satellites over prediction horizon
 * Uses SGP4 propagation and 3D distance calculation
 */
function findClosestApproach(sat1, sat2) {
  let minDistance = Infinity;
  let closestTime = null;
  let closestRelVel = 0;
  let closestPositions = null;

  // Step through time in 1-minute increments
  for (let step = 0; step <= TIME_STEPS; step++) {
    const minutesAhead = (step / TIME_STEPS) * PREDICTION_HORIZON_MINUTES;

    // Propagate both satellites forward
    const pos1 = propagateSatellitePosition(sat1, minutesAhead);
    const pos2 = propagateSatellitePosition(sat2, minutesAhead);

    if (pos1 && pos2) {
      // Calculate 3D distance in ECI frame
      const distance = calculateDistance3D(pos1.position, pos2.position);

      if (distance < minDistance) {
        minDistance = distance;
        closestTime = minutesAhead;
        
        // Calculate relative velocity
        if (pos1.velocity && pos2.velocity) {
          closestRelVel = calculateRelativeVelocity(pos1.velocity, pos2.velocity);
        }

        closestPositions = {
          sat1: pos1.position,
          sat2: pos2.position
        };
      }
    }
  }

  if (minDistance === Infinity) return null;

  return {
    missDistance: minDistance,
    timeToClosestApproach: closestTime,
    relativeVelocity: closestRelVel,
    positions: closestPositions,
    timestamp: new Date(Date.now() + closestTime * 60000)
  };
}

/**
 * Propagate satellite position using available data
 * Falls back to simple propagation if SGP4 not available
 */
function propagateSatellitePosition(sat, minutesAhead) {
  // Try SGP4 propagation first (most accurate)
  if (sat.satrec) {
    return propagateSatellite(sat, minutesAhead);
  }

  // Fallback: simple circular orbit assumption
  // This is less accurate but works for demo satellites
  if (sat.altitude && sat.latitude !== undefined && sat.longitude !== undefined) {
    return propagateSimple(sat, minutesAhead);
  }

  return null;
}

/**
 * Simple propagation for demo satellites without TLE data
 * Assumes circular orbit and constant angular velocity
 */
function propagateSimple(sat, minutesAhead) {
  // Orbital period for circular orbit: T = 2π√(a³/μ)
  // where a = orbital radius, μ = Earth's gravitational parameter
  const GM = 398600.4418; // km³/s² (Earth's gravitational parameter)
  const orbitalRadius = EARTH_RADIUS_KM + sat.altitude;
  const period = 2 * Math.PI * Math.sqrt(Math.pow(orbitalRadius, 3) / GM) / 60; // minutes

  // Angular displacement
  const angularVelocity = 360 / period; // degrees per minute
  const displacement = angularVelocity * minutesAhead;

  // New longitude (simple rotation)
  const newLon = sat.longitude + displacement;

  // Convert to ECI Cartesian coordinates
  const lat = sat.latitude * Math.PI / 180;
  const lon = newLon * Math.PI / 180;

  const position = {
    x: orbitalRadius * Math.cos(lat) * Math.cos(lon),
    y: orbitalRadius * Math.cos(lat) * Math.sin(lon),
    z: orbitalRadius * Math.sin(lat)
  };

  // Estimate velocity (tangent to circular orbit)
  const velocity = Math.sqrt(GM / orbitalRadius); // km/s

  return {
    position,
    velocity: { x: 0, y: velocity, z: 0 }, // Simplified
    timestamp: new Date(Date.now() + minutesAhead * 60000)
  };
}

/**
 * Calculate 3D Euclidean distance between two position vectors
 */
function calculateDistance3D(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate relative velocity magnitude between two satellites
 * This is critical: high relative velocity = more dangerous collision
 */
function calculateRelativeVelocity(vel1, vel2) {
  const dvx = vel1.x - vel2.x;
  const dvy = vel1.y - vel2.y;
  const dvz = vel1.z - vel2.z;
  return Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
}

/**
 * Assess collision risk level based on miss distance and relative velocity
 * 
 * Risk factors:
 * - Small miss distance = higher collision probability
 * - High relative velocity = more destructive collision if it happens
 */
function getRiskLevel(missDistance, relativeVelocity) {
  if (missDistance < 0.1) return 'CRITICAL'; // < 100m
  if (missDistance < 0.5) return 'HIGH';     // < 500m
  if (missDistance < 1.0) return 'ELEVATED'; // < 1 km
  return 'MODERATE';
}

/**
 * Simulate debris cascade from a collision (Kessler Syndrome)
 * 
 * Physics:
 * - High-velocity collision fragments both objects
 * - Debris cone spreads along velocity vector
 * - Secondary collisions can cascade
 * 
 * This is a simplified model; real debris modeling uses:
 * - NASA EVOLVE, ESA DRAMA, or similar tools
 * - Considers mass, material, impact angle, velocity
 */
export function simulateDebrisCascade(conjunction) {
  const { relativeVelocity, positions, sat1: satellite1, sat2: satellite2 } = conjunction;

  // Estimate debris generation
  // Higher relative velocity = more fragments
  const fragmentCount = Math.floor(50 + relativeVelocity * 10);

  // Generate debris cone
  const debris = [];
  for (let i = 0; i < fragmentCount; i++) {
    // Random velocity perturbation from collision
    const deltaV = {
      x: (Math.random() - 0.5) * relativeVelocity * 0.3,
      y: (Math.random() - 0.5) * relativeVelocity * 0.3,
      z: (Math.random() - 0.5) * relativeVelocity * 0.3
    };

    debris.push({
      position: positions.sat1, // Start at collision point
      velocity: deltaV,
      size: Math.random() * 0.5, // 0-50 cm
      satellite1Name: satellite1.name,
      satellite2Name: satellite2.name,
      createdAt: new Date()
    });
  }

  return debris;
}

/**
 * Identify which satellites would be affected by debris cascade
 * This drives the "service impact" visualization
 */
export function identifyAffectedSatellites(debris, allSatellites) {
  const affected = [];

  // Check which satellites are in the debris cloud path
  for (const sat of allSatellites) {
    // Simple proximity check (real system would use probabilistic flux calculation)
    const inDebrisZone = debris.some(frag => {
      if (!sat.position || !frag.position) return false;
      const distance = calculateDistance3D(sat.position, frag.position);
      return distance < 100; // Within 100 km of debris
    });

    if (inDebrisZone) {
      affected.push({
        satellite: sat,
        riskLevel: 'ELEVATED',
        reason: 'In debris field path'
      });
    }
  }

  return affected;
}
