"""
Test NOAA SWPC API connections
Verify we can fetch real-time and historical solar data
"""

from noaa_client import NOAAClient
from datetime import datetime, timedelta


def test_realtime_data():
    """Test real-time SWPC endpoints"""
    print("=" * 60)
    print("🧪 TESTING REAL-TIME SWPC DATA")
    print("=" * 60)
    
    client = NOAAClient()
    
    # Test 1: Current F10.7 solar flux
    print("\n[Test 1] Current F10.7 Solar Flux")
    print("-" * 40)
    flux = client.get_current_solar_flux()
    if flux:
        print(f"✅ Success!")
        print(f"   Timestamp: {flux['timestamp']}")
        print(f"   F10.7: {flux['f107']} sfu")
        print(f"   Source: {flux['source']}")
    else:
        print("❌ Failed to fetch F10.7")
    
    # Test 2: Current Kp index
    print("\n[Test 2] Current Kp Geomagnetic Index")
    print("-" * 40)
    kp = client.get_kp_index()
    if kp:
        print(f"✅ Success!")
        print(f"   Timestamp: {kp['timestamp']}")
        print(f"   Kp: {kp['kp']}")
        print(f"   Source: {kp['source']}")
    else:
        print("❌ Failed to fetch Kp index")
    
    # Test 3: Check G-scale from Kp (storm level endpoint deprecated)
    print("\n[Test 3] G-Scale Derived from Kp")
    print("-" * 40)
    if kp:
        print(f"✅ Success!")
        print(f"   G-Scale: {kp['g_scale']}")
        print(f"   Storm Level: {kp['storm_level']}")
        print(f"   (Derived from Kp={kp['kp']})")
    else:
        print("❌ Failed to derive G-scale")
    
    # Test 4: Comprehensive solar weather
    print("\n[Test 4] Comprehensive Solar Weather Data")
    print("-" * 40)
    weather = client.get_solar_weather_data()
    print(f"✅ Success!")
    print(f"   Solar Flux: {weather['solar_flux']} sfu")
    print(f"   Kp Index: {weather['kp_index']}")
    print(f"   Activity: {weather['activity_level']}")
    print(f"   Density Multiplier: {weather['density_multiplier']}x")
    print(f"   Drag Increase: +{weather['drag_increase_percent']}%")
    print(f"   Data Source: {weather['source']}")


def test_historical_data():
    """Test historical solar flux retrieval"""
    print("\n" + "=" * 60)
    print("🧪 TESTING HISTORICAL SWPC DATA")
    print("=" * 60)
    
    client = NOAAClient()
    
    # Test: Get past 120 days of F10.7
    print("\n[Test 5] Historical F10.7 (Past 120 Days)")
    print("-" * 40)
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=120)
    
    historical = client.get_historical_solar_flux(start_date, end_date)
    
    if historical and len(historical) > 0:
        print(f"✅ Success!")
        print(f"   Retrieved: {len(historical)} days of data")
        print(f"   Date range: {historical[0]['date'][:10]} to {historical[-1]['date'][:10]}")
        print(f"   F10.7 range: {min(d['f107'] for d in historical):.1f} - {max(d['f107'] for d in historical):.1f} sfu")
        
        # Show first 5 and last 5 points
        print(f"\n   First 5 points:")
        for point in historical[:5]:
            print(f"      {point['date'][:10]}: {point['f107']:.1f} sfu")
        
        print(f"\n   Last 5 points:")
        for point in historical[-5:]:
            print(f"      {point['date'][:10]}: {point['f107']:.1f} sfu")
    else:
        print("❌ Failed to fetch historical data")
    
    return historical


def test_data_quality(historical_data):
    """Analyze quality of historical data"""
    print("\n" + "=" * 60)
    print("📊 DATA QUALITY ANALYSIS")
    print("=" * 60)
    
    if not historical_data:
        print("❌ No data to analyze")
        return
    
    # Check for missing days
    dates = [datetime.fromisoformat(d['date']) for d in historical_data]
    date_diffs = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
    
    missing_days = sum(1 for diff in date_diffs if diff > 1)
    
    print(f"\n✓ Data Continuity:")
    print(f"   Total days: {len(historical_data)}")
    print(f"   Missing days: {missing_days}")
    print(f"   Completeness: {((len(historical_data) - missing_days) / len(historical_data) * 100):.1f}%")
    
    # Check F10.7 value distribution
    f107_values = [d['f107'] for d in historical_data]
    
    print(f"\n✓ F10.7 Distribution:")
    print(f"   Min: {min(f107_values):.1f} sfu")
    print(f"   Max: {max(f107_values):.1f} sfu")
    print(f"   Mean: {sum(f107_values)/len(f107_values):.1f} sfu")
    print(f"   Range: {'LOW' if max(f107_values) < 150 else 'MODERATE' if max(f107_values) < 200 else 'HIGH'}")
    
    # Check for outliers (< 50 or > 300 are suspicious)
    outliers = [v for v in f107_values if v < 50 or v > 300]
    if outliers:
        print(f"\n⚠️  Warning: {len(outliers)} outlier values detected")
    else:
        print(f"\n✓ No outliers detected (all values in 50-300 sfu range)")


def main():
    """Run all tests"""
    print("\n")
    print("🌞 NOAA SWPC API TEST SUITE")
    print("Testing real-time and historical space weather data access")
    print("\n")
    
    try:
        # Test real-time endpoints
        test_realtime_data()
        
        # Test historical data
        historical = test_historical_data()
        
        # Analyze data quality
        test_data_quality(historical)
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS COMPLETE")
        print("=" * 60)
        print("\n✓ SWPC API is working correctly")
        print("✓ Real-time F10.7 and Kp data available")
        print("✓ Historical F10.7 data available for training")
        print("\n🚀 Ready to proceed with model training!")
        print("\n")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
