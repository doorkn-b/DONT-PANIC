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

/**
 * Get satellites - simplified version using known satellite IDs
 * GET /api/satellites
 */
app.get('/api/satellites', async (req, res) => {
  try {
    // Get limits from query params or use defaults
    const maxTotal = parseInt(req.query.maxTotal) || 100;
    const starlinkLimit = parseInt(req.query.starlink) || 30;
    const gpsLimit = parseInt(req.query.gps) || 15;
    const issLimit = parseInt(req.query.iss) || 1;
    const weatherLimit = parseInt(req.query.weather) || 10;
    const brightestLimit = parseInt(req.query.brightest) || 20;
    const geostationaryLimit = parseInt(req.query.geostationary) || 10;
    const amateurLimit = parseInt(req.query.amateur) || 10;
    
    console.log(`📡 Fetching up to ${maxTotal} satellites from N2YO API...`);
    
    const allSatellites = [];
    const OBSERVER = { lat: 41.702, lng: -76.014, alt: 0 };
    
    // Fetch satellites from different categories using "above" endpoint
    const categories = [
      { id: 52, name: 'Starlink', limit: starlinkLimit },
      { id: 50, name: 'GPS', limit: gpsLimit },
      { id: 2, name: 'ISS', limit: issLimit },
      { id: 3, name: 'Weather', limit: weatherLimit },
      { id: 1, name: 'Brightest', limit: brightestLimit },
      { id: 10, name: 'Geostationary', limit: geostationaryLimit },
      { id: 18, name: 'Amateur', limit: amateurLimit },
    ];
    
    for (const category of categories) {
      try {
        const aboveUrl = `${N2YO_BASE_URL}/above/${OBSERVER.lat}/${OBSERVER.lng}/${OBSERVER.alt}/90/${category.id}/&apiKey=${N2YO_API_KEY}`;
        console.log(`  Fetching ${category.name} category...`);
        const response = await fetch(aboveUrl);
        
        if (response.ok) {
          const data = await response.json();
          
          // Check for API errors
          if (data.error) {
            console.log(`  ❌ N2YO API error for ${category.name}: ${data.error}`);
            continue;
          }
          
          if (data.above && data.above.length > 0) {
            const limited = data.above.slice(0, category.limit);
            console.log(`  ✅ Found ${limited.length} ${category.name} satellites`);
            
            for (const sat of limited) {
              // Skip if limit is 0
              if (category.limit === 0) break;
              try {
                // Check if already added
                if (allSatellites.find(s => s.id === sat.satid)) {
                  continue;
                }
                
                const tleUrl = `${N2YO_BASE_URL}/tle/${sat.satid}&apiKey=${N2YO_API_KEY}`;
                const tleResponse = await fetch(tleUrl);
                
                if (tleResponse.ok) {
                  const tleData = await tleResponse.json();
                  
                  if (tleData.tle) {
                    const tleLines = tleData.tle.split('\r\n');
                    
                    if (tleLines.length >= 2) {
                      allSatellites.push({
                        name: sat.satname,
                        id: sat.satid,
                        tleLine1: tleLines[0].trim(),
                        tleLine2: tleLines[1].trim(),
                        category: category.name
                      });
                    }
                  }
                }
                
                // Rate limit protection
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // Stop if we hit max total
                if (allSatellites.length >= maxTotal) break;
              } catch (err) {
                console.warn(`  ⚠️ Error fetching TLE for ${sat.satid}`);
              }
            }
          } else {
            console.log(`  ℹ️ No ${category.name} satellites found`);
          }
        } else {
          const errorText = await response.text();
          console.log(`  ❌ HTTP ${response.status} for ${category.name}: ${errorText.substring(0, 100)}`);
        }
        
        // Stop if we hit max total
        if (allSatellites.length >= maxTotal) break;
        
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
  console.log(`\n🚀 Satellite Proxy Server (SIMPLE) running on http://localhost:${PORT}`);
  console.log(`📡 N2YO API Key: ${N2YO_API_KEY.substring(0, 10)}...`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /api/satellites - Fetch satellite TLE data`);
  console.log(`  GET /api/health     - Health check\n`);
});
