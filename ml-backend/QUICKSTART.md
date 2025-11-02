# Quick Start - Test NOAA Data First

## Step 1: Setup Python Environment

```powershell
# Navigate to ml-backend folder
cd C:\Users\arnab\G-R\orbitshield\ml-backend

# Create virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Step 2: Test NOAA API (No credentials needed!)

```powershell
# Run NOAA test (doesn't need Space-Track credentials)
python test_noaa.py
```

### Expected Output:

```
🌞 NOAA SWPC API TEST SUITE

============================================================
🧪 TESTING REAL-TIME SWPC DATA
============================================================

[Test 1] Current F10.7 Solar Flux
✅ Success!
   Timestamp: 2025-11-02 12:00:00
   F10.7: 145.2 sfu
   Source: NOAA_SWPC

[Test 2] Current Kp Geomagnetic Index
✅ Success!
   Timestamp: 2025-11-02 12:00:00
   Kp: 3.0
   Source: NOAA_SWPC

[Test 3] Current Geomagnetic Storm Level
✅ Success!
   Storm Scale: G0
   Status: No storm

[Test 4] Comprehensive Solar Weather Data
✅ Success!
   Solar Flux: 145.2 sfu
   Kp Index: 3.0
   Activity: Moderate
   Density Multiplier: 1.084x
   Drag Increase: +8.4%
   Data Source: NOAA_SWPC

============================================================
🧪 TESTING HISTORICAL SWPC DATA
============================================================

[Test 5] Historical F10.7 (Past 120 Days)
📅 Fetching historical F10.7 from 2025-07-05 to 2025-11-02...
✅ Retrieved 5 months of F10.7 data from SWPC
✅ Generated 120 daily F10.7 values
✅ Success!
   Retrieved: 120 days of data
   Date range: 2025-07-05 to 2025-11-02
   F10.7 range: 118.5 - 165.3 sfu

============================================================
📊 DATA QUALITY ANALYSIS
============================================================

✓ Data Continuity:
   Total days: 120
   Missing days: 0
   Completeness: 100.0%

✓ F10.7 Distribution:
   Min: 118.5 sfu
   Max: 165.3 sfu
   Mean: 142.1 sfu
   Range: MODERATE

✓ No outliers detected

============================================================
✅ ALL TESTS COMPLETE
============================================================

✓ SWPC API is working correctly
✓ Real-time F10.7 and Kp data available
✓ Historical F10.7 data available for training

🚀 Ready to proceed with model training!
```

## What This Proves:

✅ **Real-time solar data working** - Current F10.7 and Kp from SWPC
✅ **Historical data working** - 120 days of F10.7 for training
✅ **No authentication needed** - SWPC APIs are public
✅ **Data quality good** - Complete, no gaps, realistic values

## Step 3: Next - Add Space-Track

Once NOAA test passes, set up Space-Track credentials:

```powershell
# Set environment variables
$env:SPACETRACK_USERNAME = "your_username"
$env:SPACETRACK_PASSWORD = "your_password"

# Then run full training
python train_model.py
```

## Summary

**Right now:** Test NOAA data (works immediately, no setup)
**Next:** Add Space-Track credentials
**Then:** Full model training with real TLE + solar data
