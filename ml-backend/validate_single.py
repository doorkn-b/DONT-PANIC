"""
Deep-dive validation: Compare model prediction vs actual decay for ONE satellite
"""
import os
from datetime import datetime, timedelta
from train_model import DecayPredictor
import pandas as pd

# Get credentials
username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

if not username or not password:
    print("❌ ERROR: Set credentials first")
    exit(1)

# Pick a satellite that actually decayed
# NORAD 56118 - STARLINK-6105 (decayed Nov 2, 2025)
NORAD_ID = 56118

print("=" * 70)
print(f"🔬 DETAILED VALIDATION - NORAD {NORAD_ID}")
print("=" * 70)

# Create predictor and load model
predictor = DecayPredictor(username, password)
print("\n🔄 Testing STARLINK MODEL (newly trained)...")
predictor.load_model('starlink_decay_model.pkl')

# Get decay info
print("\n📊 Step 1: Get actual decay information")
decays = predictor.st_client.get_decay_data(days_back=30)
target_decay = next((d for d in decays if d['norad_id'] == str(NORAD_ID)), None)

if not target_decay:
    print(f"❌ No decay data found for NORAD {NORAD_ID}")
    exit(1)

decay_date = datetime.strptime(target_decay['decay_date'].replace(' 0:', ' 00:'), '%Y-%m-%d %H:%M:%S')
print(f"✅ Satellite: {target_decay['name']}")
print(f"   Decayed: {target_decay['decay_date']}")
print(f"   RCS: {target_decay['rcs_size']}")

# Get TLE history
print(f"\n📊 Step 2: Get TLE history (60 days)")
history = predictor.st_client.get_tle_history(NORAD_ID, days_back=60)

if not history:
    print("❌ No TLE history")
    exit(1)

print(f"✅ Retrieved {len(history)} TLE records")

# Convert to dataframe for analysis
df_data = []
for tle in history:
    epoch = datetime.strptime(tle['epoch'].split('.')[0].replace('T', ' '), '%Y-%m-%d %H:%M:%S')
    days_to_decay = (decay_date - epoch).days
    df_data.append({
        'epoch': epoch,
        'days_to_decay': days_to_decay,
        'altitude': tle['altitude'],
        'mean_motion': tle['mean_motion'],
        'eccentricity': tle['eccentricity']
    })

df = pd.DataFrame(df_data)
df = df.sort_values('epoch')

print(f"\n📈 Altitude progression (last 30 days before decay):")
print("-" * 70)
recent = df[df['days_to_decay'] <= 30].tail(15)
for _, row in recent.iterrows():
    print(f"   {row['epoch'].strftime('%Y-%m-%d')}: {row['altitude']:6.1f} km "
          f"({row['days_to_decay']:2d} days before decay)")

# Calculate actual decay rate
if len(recent) > 1:
    first_alt = recent.iloc[0]['altitude']
    last_alt = recent.iloc[-1]['altitude']
    days_span = (recent.iloc[-1]['epoch'] - recent.iloc[0]['epoch']).days
    actual_decay_rate = (last_alt - first_alt) / days_span
    print(f"\n📉 Actual decay rate: {actual_decay_rate:.3f} km/day")

# Now make predictions at different time points
print(f"\n🤖 Step 3: Model predictions at different time points")
print("-" * 70)

# Get solar data
solar_data = predictor.noaa_client.get_current_solar_flux()
if not solar_data:
    solar_data = {'f107': 150.0}

# Test predictions at T-30, T-14, T-7 days
test_points = [30, 14, 7]

for days_before in test_points:
    # Find TLE closest to this point
    target_date = decay_date - timedelta(days=days_before)
    target_ts = target_date.timestamp()
    
    closest_tle = min(history, key=lambda x: abs(
        datetime.strptime(x['epoch'].split('.')[0].replace('T', ' '), '%Y-%m-%d %H:%M:%S').timestamp() - target_ts
    ))
    
    tle_epoch = datetime.strptime(closest_tle['epoch'].split('.')[0].replace('T', ' '), '%Y-%m-%d %H:%M:%S')
    actual_days_before = (decay_date - tle_epoch).days
    
    print(f"\n📍 Prediction from T-{actual_days_before} days ({tle_epoch.strftime('%Y-%m-%d')})")
    print(f"   Starting altitude: {closest_tle['altitude']:.1f} km")
    
    # Make 7-day prediction
    predictions = predictor.predict_decay(
        current_tle=closest_tle,
        current_solar=solar_data,
        horizons=[7, min(actual_days_before, 30)]
    )
    
    pred_7d = predictions['7d']['altitude_change']
    pred_alt_7d = predictions['7d']['predicted_altitude']
    
    print(f"   Model predicts (7d): {pred_7d:+.2f} km change → {pred_alt_7d:.1f} km")
    
    # Find actual altitude 7 days later (if available)
    future_date = tle_epoch + timedelta(days=7)
    if future_date < decay_date:
        future_ts = future_date.timestamp()
        future_tle = min(history, key=lambda x: abs(
            datetime.strptime(x['epoch'].split('.')[0].replace('T', ' '), '%Y-%m-%d %H:%M:%S').timestamp() - future_ts
        ))
        actual_future_alt = future_tle['altitude']
        actual_change = actual_future_alt - closest_tle['altitude']
        
        error = abs(pred_7d - actual_change)
        print(f"   Actual (7d later): {actual_change:+.2f} km change → {actual_future_alt:.1f} km")
        print(f"   Error: {error:.2f} km")
    else:
        print(f"   (Satellite decayed before 7 days elapsed)")

print("\n" + "=" * 70)
print("🎯 ANALYSIS COMPLETE")
print("=" * 70)
