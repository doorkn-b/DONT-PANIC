// Solar data fetching from NOAA Space Weather Prediction Center
// FREE API - No registration required!

const NOAA_BASE_URL = 'https://services.swpc.noaa.gov/json';

/**
 * Fetch current F10.7 solar flux (real-time)
 */
export async function getCurrentSolarFlux() {
  try {
    const response = await fetch(`${NOAA_BASE_URL}/f107_cm_flux.json`);
    
    if (!response.ok) {
      throw new Error(`NOAA API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // API returns array with most recent measurement
    const latest = data[0];
    
    return {
      timestamp: new Date(latest.time_tag),
      F107: parseFloat(latest.flux),
      source: 'NOAA SWPC',
      status: 'success'
    };
  } catch (error) {
    console.error('Failed to fetch solar flux:', error);
    
    // Fallback to estimated value if API fails
    return {
      timestamp: new Date(),
      F107: estimateSolarFlux(),
      source: 'Estimated (API unavailable)',
      status: 'fallback'
    };
  }
}

/**
 * Fetch planetary Kp index (geomagnetic activity)
 */
export async function getKpIndex() {
  try {
    const response = await fetch(`${NOAA_BASE_URL}/planetary_k_index_1m.json`);
    
    if (!response.ok) {
      throw new Error(`NOAA API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Get most recent Kp measurement
    const latest = data[data.length - 1];
    
    return {
      timestamp: new Date(latest.time_tag),
      kp: parseFloat(latest.kp_index),
      estimated_kp: parseFloat(latest.estimated_kp),
      source: 'NOAA SWPC'
    };
  } catch (error) {
    console.error('Failed to fetch Kp index:', error);
    return {
      timestamp: new Date(),
      kp: 3,
      estimated_kp: 3,
      source: 'Estimated (API unavailable)'
    };
  }
}

/**
 * Fetch 27-day solar flux forecast (for predictions)
 */
export async function getSolarForecast() {
  try {
    const response = await fetch(`${NOAA_BASE_URL}/solar_cycle/predicted_f107.json`);
    
    if (!response.ok) {
      throw new Error(`NOAA API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.map(item => ({
      date: new Date(item.time_tag),
      F107_predicted: parseFloat(item.f107),
      F107_high: parseFloat(item.f107_high) || null,
      F107_low: parseFloat(item.f107_low) || null
    }));
  } catch (error) {
    console.error('Failed to fetch solar forecast:', error);
    return [];
  }
}

/**
 * Get comprehensive solar weather data
 */
export async function getSolarWeatherData() {
  try {
    const [flux, kp] = await Promise.all([
      getCurrentSolarFlux(),
      getKpIndex()
    ]);
    
    // Calculate solar activity level
    const activityLevel = getSolarActivityLevel(flux.F107);
    
    // Calculate atmospheric density multiplier
    const densityMultiplier = calculateDensityMultiplier(flux.F107);
    
    return {
      timestamp: new Date(),
      solarFlux: flux.F107,
      kpIndex: kp.kp,
      activityLevel,
      densityMultiplier,
      dragIncrease: ((densityMultiplier - 1) * 100).toFixed(1) + '%',
      source: flux.source,
      status: flux.status
    };
  } catch (error) {
    console.error('Failed to fetch solar weather data:', error);
    return null;
  }
}

/**
 * Calculate atmospheric density multiplier based on F10.7
 * Higher solar activity → denser atmosphere → more drag
 */
function calculateDensityMultiplier(F107) {
  // Base F10.7 is around 120 (solar minimum)
  // F10.7 ranges from ~60 (very quiet) to ~300+ (extreme activity)
  const baseF107 = 120;
  
  // Empirical relationship: ~0.3% density change per unit F10.7
  const multiplier = 1 + ((F107 - baseF107) / 300);
  
  return Math.max(0.8, Math.min(multiplier, 1.5)); // Clamp between 0.8 and 1.5
}

/**
 * Determine solar activity level from F10.7
 */
function getSolarActivityLevel(F107) {
  if (F107 < 80) return 'Very Low';
  if (F107 < 120) return 'Low';
  if (F107 < 150) return 'Moderate';
  if (F107 < 180) return 'High';
  if (F107 < 210) return 'Very High';
  return 'Extreme';
}

/**
 * Estimate solar flux if API is unavailable
 * Uses 27-day solar rotation cycle approximation
 */
function estimateSolarFlux() {
  const now = Date.now();
  const solarRotationPeriod = 27 * 24 * 60 * 60 * 1000; // 27 days in ms
  
  // Base value + sinusoidal variation
  const base = 140;
  const amplitude = 30;
  const phase = (now / solarRotationPeriod) * 2 * Math.PI;
  
  return base + amplitude * Math.sin(phase);
}

/**
 * Test function - call this to verify NOAA API is working
 */
export async function testNOAAConnection() {
  console.log('🌞 Testing NOAA Solar Data API...');
  
  try {
    const data = await getSolarWeatherData();
    
    if (data && data.status === 'success') {
      console.log('✅ NOAA API Connection: SUCCESS');
      console.log('📊 Current Solar Data:');
      console.log(`   F10.7 Flux: ${data.solarFlux}`);
      console.log(`   Activity Level: ${data.activityLevel}`);
      console.log(`   Kp Index: ${data.kpIndex}`);
      console.log(`   Drag Increase: ${data.dragIncrease}`);
      return true;
    } else {
      console.log('⚠️ NOAA API Connection: Using fallback data');
      return false;
    }
  } catch (error) {
    console.error('❌ NOAA API Connection: FAILED', error);
    return false;
  }
}
