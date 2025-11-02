const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// Enable CORS for frontend
app.use(cors());

// N2YO API configuration
const N2YO_API_KEY = '2DG2C5-XDWT8L-HHFGUQ-5LH2';
const N2YO_BASE_URL = 'https://api.n2yo.com/rest/v1/satellite';

// Observer location (default: somewhere in US)
const OBSERVER = {
  lat: 41.702,
  lng: -76.014,
  alt: 0
};

/**
 * Get satellites above observer location
 * GET /api/satellites
 */
app.get('/api/satellites', async (req, res) => {
  try {
    console.log('📡 Fetching satellites from N2YO API...');
    
    // Fetch different categories (reduced limits to avoid API overload)
    const categories = [
      { id: 2, name: 'ISS', limit: 5 },
      { id: 52, name: 'Starlink', limit: 80 },
      { id: 50, name: 'GPS', limit: 25 },
      { id: 1, name: 'Brightest', limit: 15 },
      { id: 15, name: 'Iridium', limit: 30 },
      { id: 10, name: 'Geostationary', limit: 20 },
      { id: 3, name: 'Weather', limit: 15 }
    ];

    const allSatellites = [];

    for (const category of categories) {
      try {
        const url = `${N2YO_BASE_URL}/above/${OBSERVER.lat}/${OBSERVER.lng}/${OBSERVER.alt}/90/${category.id}/&apiKey=${N2YO_API_KEY}`;
        console.log(`  Fetching ${category.name}...`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn(`  ⚠️ Failed to fetch ${category.name}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.above && data.above.length > 0) {
          console.log(`  ✅ Found ${data.above.length} ${category.name} satellites`);
          
          // Fetch TLE for each satellite (limit to prevent rate limiting)
          const satellitesToFetch = data.above.slice(0, category.limit || 20); // Limit per category
          
          for (const sat of satellitesToFetch) {
            try {
              const tleUrl = `${N2YO_BASE_URL}/tle/${sat.satid}&apiKey=${N2YO_API_KEY}`;
              const tleResponse = await fetch(tleUrl);
              
              if (tleResponse.ok) {
                const tleData = await tleResponse.json();
                
                // Debug: log what we received
                console.log(`    TLE for ${sat.satname}:`, tleData.tle ? 'OK' : 'MISSING');
                
                // Parse TLE data - handle different response formats
                if (tleData.tle && typeof tleData.tle === 'string') {
                  // Try different split methods
                  let tleLines = tleData.tle.split('\r\n');
                  if (tleLines.length < 2) {
                    tleLines = tleData.tle.split('\n');
                  }
                  
                  console.log(`    Lines found: ${tleLines.length}, Line1: ${tleLines[0] ? 'YES' : 'NO'}, Line2: ${tleLines[1] ? 'YES' : 'NO'}`);
                  
                  if (tleLines.length >= 2 && tleLines[0] && tleLines[1]) {
                    const line1 = tleLines[0].trim();
                    const line2 = tleLines[1].trim();
                    
                    // Validate TLE format
                    if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
                      allSatellites.push({
                        name: sat.satname,
                        id: sat.satid,
                        tleLine1: line1,
                        tleLine2: line2,
                        category: category.name
                      });
                      console.log(`    ✅ Added ${sat.satname}`);
                    } else {
                      console.warn(`    ⚠️ Invalid TLE format for ${sat.satname}`);
                    }
                  }
                } else {
                  console.warn(`    ⚠️ No TLE string for ${sat.satname}`);
                }
              } else {
                console.warn(`    ⚠️ TLE fetch failed for ${sat.satname}: ${tleResponse.status}`);
              }
              
              // Small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
              console.warn(`  ⚠️ Error fetching TLE for ${sat.satname}:`, err.message);
            }
          }
        }
      } catch (err) {
        console.warn(`  ⚠️ Error fetching category ${category.name}:`, err.message);
      }
    }

    console.log(`✅ Total satellites fetched: ${allSatellites.length}`);
    
    res.json({
      success: true,
      count: allSatellites.length,
      satellites: allSatellites,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching satellites:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Satellite Proxy Server running on http://localhost:${PORT}`);
  console.log(`📡 N2YO API Key: ${N2YO_API_KEY.substring(0, 10)}...`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /api/satellites - Fetch satellite TLE data`);
  console.log(`  GET /api/health     - Health check\n`);
});
