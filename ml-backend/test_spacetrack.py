import os
from spacetrack_client import SpaceTrackClient

print("🛰️  SPACE-TRACK.ORG API TEST\n")

# Get credentials from environment variables
username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

if not username or not password:
    print("❌ ERROR: Please set environment variables:")
    print("   $env:SPACETRACK_USERNAME = 'your_username'")
    print("   $env:SPACETRACK_PASSWORD = 'your_password'")
    exit(1)

print(f"Username: {username}")
print(f"Password: {'*' * len(password)}\n")

# Create client
client = SpaceTrackClient(username, password)

# Test 1: Authentication
print("=" * 60)
print("🔐 TEST 1: AUTHENTICATION")
print("=" * 60)
try:
    client.authenticate()
    print("✅ Successfully authenticated with Space-Track.org!")
except Exception as e:
    print(f"❌ Authentication failed: {e}")
    exit(1)

# Test 2: Get current ISS TLE
print("\n" + "=" * 60)
print("🛰️  TEST 2: CURRENT ISS TLE (NORAD 25544)")
print("=" * 60)
try:
    tle = client.get_current_tle(25544)
    if tle:
        print("✅ Successfully retrieved ISS TLE!")
        print(f"  Epoch: {tle['epoch']}")
        print(f"  Altitude: {tle['altitude_km']:.2f} km")
        print(f"  Mean Motion: {tle['mean_motion']:.8f} rev/day")
        print(f"  Eccentricity: {tle['eccentricity']:.7f}")
        print(f"  Inclination: {tle['inclination']:.4f}°")
    else:
        print("❌ Failed to retrieve TLE")
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

# Test 3: Get 30 days of ISS history
print("\n" + "=" * 60)
print("📅 TEST 3: ISS TLE HISTORY (Past 30 Days)")
print("=" * 60)
try:
    history = client.get_tle_history(25544, days_back=30)
    if history:
        print(f"✅ Retrieved {len(history)} historical TLEs")
        print(f"\nFirst TLE:")
        print(f"  Date: {history[0]['epoch']}")
        print(f"  Altitude: {history[0]['altitude']:.2f} km")
        print(f"\nLast TLE:")
        print(f"  Date: {history[-1]['epoch']}")
        print(f"  Altitude: {history[-1]['altitude']:.2f} km")
        
        # Calculate decay rate
        alt_start = history[0]['altitude']
        alt_end = history[-1]['altitude']
        decay = alt_start - alt_end
        print(f"\n📉 Altitude change: {decay:.2f} km over 30 days")
        print(f"   Decay rate: {decay/30:.3f} km/day")
    else:
        print("❌ Failed to retrieve history")
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("✅ SPACE-TRACK TESTS COMPLETE")
print("=" * 60)
print("\n🚀 Ready to collect training data and train the model!")
