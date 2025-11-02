/**
 * SPACE WEATHER STRESS CALCULATOR
 * 
 * Maps live space weather conditions to orbital shell stress levels
 * This is the "failure pressure" layer that shows which altitude bands
 * are currently under environmental stress
 * 
 * Key insight: Space weather doesn't affect individual satellites uniformly
 * - Different altitudes experience different drag increases
 * - Different orbits have different radiation exposure
 * - Polar orbits are more affected by geomagnetic storms
 */

// Define key orbital shells to monitor
const ORBITAL_SHELLS = [
  {
    name: 'ISS Altitude Band',
    minAltitude: 350,
    maxAltitude: 450,
    centerAltitude: 408,
    population: 'ISS, Crew Dragon, imaging sats',
    dragSensitivity: 1.0, // Highest drag sensitivity
    radiationSensitivity: 0.3
  },
  {
    name: 'Starlink Primary Shell',
    minAltitude: 500,
    maxAltitude: 600,
    centerAltitude: 550,
    population: 'Starlink constellation, other LEO broadband',
    dragSensitivity: 0.8,
    radiationSensitivity: 0.4
  },
  {
    name: 'Sun-Synchronous Polar',
    minAltitude: 600,
    maxAltitude: 900,
    centerAltitude: 750,
    population: 'Earth observation, weather sats',
    dragSensitivity: 0.5,
    radiationSensitivity: 0.6 // Higher radiation at poles
  },
  {
    name: 'GPS/MEO Navigation',
    minAltitude: 19000,
    maxAltitude: 21000,
    centerAltitude: 20180,
    population: 'GPS, GLONASS, Galileo',
    dragSensitivity: 0.0, // No atmospheric drag at MEO
    radiationSensitivity: 1.0 // Maximum radiation exposure (Van Allen belts)
  }
];

/**
 * Calculate stress scores for all orbital shells based on current space weather
 * Returns array of shell objects with stress levels and impact descriptions
 */
export function calculateSpaceWeatherStress(spaceWeather) {
  if (!spaceWeather) return [];

  console.log('Calculating orbital shell stress levels...');

  const stressedShells = ORBITAL_SHELLS.map(shell => {
    // Calculate drag stress (primarily affects LEO)
    const dragStress = calculateDragStress(
      shell,
      spaceWeather.atmosphericDensityMultiplier,
      spaceWeather.kpIndex
    );

    // Calculate radiation stress (primarily affects MEO/GEO and polar orbits)
    const radiationStress = calculateRadiationStress(
      shell,
      spaceWeather.kpIndex
    );

    // Calculate conjunction tracking degradation
    // When storms cause mass maneuvers, conjunction prediction breaks down
    const trackingDegradation = calculateTrackingDegradation(
      shell,
      spaceWeather.kpIndex,
      spaceWeather.atmosphericDensityMultiplier
    );

    // Overall stress score (0-100)
    const overallStress = Math.min(100, 
      dragStress * 0.4 + 
      radiationStress * 0.3 + 
      trackingDegradation * 0.3
    );

    // Determine stress level
    const stressLevel = getStressLevel(overallStress);

    // Generate impact description
    const impact = generateImpactDescription(
      shell,
      stressLevel,
      dragStress,
      radiationStress,
      trackingDegradation,
      spaceWeather
    );

    return {
      ...shell,
      dragStress,
      radiationStress,
      trackingDegradation,
      overallStress,
      stressLevel,
      impact,
      color: getStressColor(stressLevel),
      services: getAffectedServices(shell, stressLevel)
    };
  });

  console.log('Shell stress calculated:', stressedShells.map(s => ({
    name: s.name,
    level: s.stressLevel,
    stress: s.overallStress
  })));

  return stressedShells;
}

/**
 * Calculate drag-induced stress on orbital shell
 * 
 * Physics:
 * - Drag force: F = ½ ρ v² C_d A
 * - ρ (density) increases exponentially with Kp during storms
 * - Higher density → faster orbital decay → more fuel needed to maintain altitude
 */
function calculateDragStress(shell, densityMultiplier, kpIndex) {
  // No drag above ~1000 km
  if (shell.centerAltitude > 1000) return 0;

  // Base drag stress from atmospheric density increase
  const densityStress = (densityMultiplier - 1) * shell.dragSensitivity * 25;

  // Additional stress if Kp is high (indicates ongoing storm)
  const stormStress = Math.max(0, (kpIndex - 4)) * 10 * shell.dragSensitivity;

  return Math.min(100, densityStress + stormStress);
}

/**
 * Calculate radiation-induced stress
 * 
 * Geomagnetic storms increase:
 * - Solar energetic particles
 * - Radiation belt flux
 * - Single-event upsets in electronics
 */
function calculateRadiationStress(shell, kpIndex) {
  // Radiation stress increases with Kp
  const baseRadiation = Math.max(0, (kpIndex - 3)) * 15;

  // Apply shell-specific sensitivity
  return Math.min(100, baseRadiation * shell.radiationSensitivity);
}

/**
 * Calculate conjunction tracking degradation
 * 
 * Critical insight from May 2024 storm:
 * - Drag spike → mass station-keeping maneuvers
 * - TLEs become outdated within hours
 * - Conjunction screening reliability drops
 * - Collision risk actually increases during storms
 */
function calculateTrackingDegradation(shell, kpIndex, densityMultiplier) {
  // Only affects shells where drag is significant
  if (shell.centerAltitude > 1000) return 0;

  // Severe storms cause tracking chaos
  if (kpIndex >= 6 && densityMultiplier >= 3) {
    return 80; // High degradation
  }

  if (kpIndex >= 5 && densityMultiplier >= 2) {
    return 50; // Moderate degradation
  }

  return 0;
}

/**
 * Convert stress score to categorical level
 */
function getStressLevel(score) {
  if (score < 20) return 'NORMAL';
  if (score < 40) return 'ELEVATED';
  if (score < 60) return 'HIGH';
  if (score < 80) return 'SEVERE';
  return 'CRITICAL';
}

/**
 * Get color for visualization based on stress level
 */
function getStressColor(level) {
  const colors = {
    'NORMAL': '#00ff00',
    'ELEVATED': '#88ff00',
    'HIGH': '#ffaa00',
    'SEVERE': '#ff4400',
    'CRITICAL': '#ff0000'
  };
  return colors[level] || '#00ff00';
}

/**
 * Generate detailed impact description for each shell
 * This is what gets displayed in the UI
 */
function generateImpactDescription(shell, stressLevel, dragStress, radiationStress, trackingDeg, weather) {
  const impacts = [];

  // Drag impacts
  if (dragStress > 40) {
    impacts.push({
      type: 'drag',
      severity: dragStress > 70 ? 'severe' : 'high',
      description: `Atmospheric density ${weather.atmosphericDensityMultiplier.toFixed(1)}× baseline. Satellites losing altitude rapidly, requiring emergency station-keeping burns.`
    });
  }

  // Radiation impacts
  if (radiationStress > 40) {
    impacts.push({
      type: 'radiation',
      severity: radiationStress > 70 ? 'severe' : 'high',
      description: `Elevated radiation flux. Single-event upsets possible. Satellites may enter safe mode or experience nav/timing errors.`
    });
  }

  // Tracking degradation impacts
  if (trackingDeg > 40) {
    impacts.push({
      type: 'tracking',
      severity: trackingDeg > 70 ? 'severe' : 'high',
      description: `Mass maneuver activity detected. TLEs outdated within hours. Conjunction screening unreliable—collision risk elevated.`
    });
  }

  // Shell-specific warnings
  if (shell.name === 'ISS Altitude Band' && stressLevel !== 'NORMAL') {
    impacts.push({
      type: 'crew-safety',
      severity: stressLevel === 'CRITICAL' ? 'critical' : 'high',
      description: `ISS crew safety: elevated debris flux and atmospheric drag. Station may require re-boost maneuver.`
    });
  }

  if (shell.name === 'GPS/MEO Navigation' && radiationStress > 50) {
    impacts.push({
      type: 'service',
      severity: 'high',
      description: `GPS timing accuracy degraded. Impact on financial trading timestamps, power grid phase sync, precision agriculture.`
    });
  }

  if (shell.name === 'Starlink Primary Shell' && dragStress > 50) {
    impacts.push({
      type: 'service',
      severity: 'high',
      description: `Starlink constellation under stress. Potential service degradation: higher latency, packet loss, temporary outages in polar/maritime regions.`
    });
  }

  return impacts;
}

/**
 * Identify Earth services affected by stress in each shell
 */
function getAffectedServices(shell, stressLevel) {
  if (stressLevel === 'NORMAL' || stressLevel === 'ELEVATED') return [];

  const serviceMap = {
    'ISS Altitude Band': [
      { name: 'Crew Safety', icon: '👨‍🚀', impact: 'Elevated debris risk' },
      { name: 'Earth Imaging', icon: '📸', impact: 'Mission delays' }
    ],
    'Starlink Primary Shell': [
      { name: 'Broadband', icon: '📡', impact: 'Service degradation in polar regions' },
      { name: 'Maritime Comms', icon: '🚢', impact: 'Connectivity interruptions' }
    ],
    'Sun-Synchronous Polar': [
      { name: 'Weather Forecasting', icon: '🌦️', impact: 'Data gaps in storm coverage' },
      { name: 'Climate Monitoring', icon: '🌍', impact: 'Missed observations' }
    ],
    'GPS/MEO Navigation': [
      { name: 'GPS Timing', icon: '⏱️', impact: 'Reduced accuracy' },
      { name: 'Navigation', icon: '🗺️', impact: 'Position errors' },
      { name: 'Finance', icon: '💰', impact: 'Trading timestamp drift' },
      { name: 'Power Grid', icon: '⚡', impact: 'Phase sync issues' }
    ]
  };

  return serviceMap[shell.name] || [];
}
