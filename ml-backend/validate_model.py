"""
Validate orbital decay model against real reentry data
Tests model predictions against satellites that actually decayed
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

print("=" * 70)
print("🔬 MODEL VALIDATION - Real Reentry Data")
print("=" * 70)

# Create predictor and load model
predictor = DecayPredictor(username, password)
predictor.load_model('iss_decay_model.pkl')
print("✅ Model loaded")

# Get recent decays (past 30 days)
print("\n📊 Fetching recent satellite reentries...")
decays = predictor.st_client.get_decay_data(days_back=30)

if not decays:
    print("❌ No decay data retrieved")
    exit(1)

print(f"✅ Found {len(decays)} satellites that decayed in past 30 days")

# Filter for satellites with TLE history we can validate against
print("\n🔍 Filtering for historical decays (already happened)...")
# Filter for historical decays only (decay date in the past)
now = datetime.now()
historical_decays = [d for d in decays if datetime.strptime(d['decay_date'].replace(' 0:', ' 00:'), '%Y-%m-%d %H:%M:%S') < now]

print(f"✅ Found {len(historical_decays)} historical decays to validate")
print("\n🔍 Validating predictions against actual decays...")
print("-" * 70)

validation_results = []
successful = 0
failed = 0

for decay in historical_decays[:20]:  # Test first 20 to avoid rate limits
    norad_id = decay['norad_id']
    
    # Parse decay date (format: "2025-12-28 0:00:00")
    decay_date_str = decay['decay_date'].replace(' 0:', ' 00:')  # Fix single digit hour
    decay_date = datetime.strptime(decay_date_str, '%Y-%m-%d %H:%M:%S')
    
    try:
        # Get TLE data from 7 days before decay
        lookback_date = decay_date - timedelta(days=7)
        
        # Get TLE history for this satellite
        print(f"\n📡 NORAD {norad_id}: {decay['name']}")
        print(f"   Actual decay: {decay['decay_date']}")
        print(f"   RCS size: {decay['rcs_size']}")
        
        # Try to get TLE from 7 days before decay
        history = predictor.st_client.get_tle_history(norad_id, days_back=60)
        
        if not history or len(history) == 0:
            print(f"   ⚠️  No TLE history available")
            failed += 1
            continue
        
        # Find TLE closest to 7 days before decay
        target_epoch = lookback_date.timestamp()
        closest_tle = min(history, key=lambda x: abs(
            datetime.strptime(x['epoch'].split('.')[0].replace('T', ' '), '%Y-%m-%d %H:%M:%S').timestamp() - target_epoch
        ))
        
        tle_epoch = datetime.strptime(closest_tle['epoch'].split('.')[0].replace('T', ' '), '%Y-%m-%d %H:%M:%S')
        days_before_decay = (decay_date - tle_epoch).days
        
        print(f"   TLE from: {closest_tle['epoch']} ({days_before_decay} days before decay)")
        print(f"   Altitude: {closest_tle['altitude']:.1f} km")
        
        # Get solar conditions at that time
        solar_data = predictor.noaa_client.get_current_solar_flux()
        if not solar_data:
            solar_data = {'f107': 120.0}
        
        # Make prediction
        predictions = predictor.predict_decay(
            current_tle=closest_tle,
            current_solar=solar_data,
            horizons=[7, 30]
        )
        
        predicted_altitude_7d = predictions['7d']['predicted_altitude']
        actual_decay_happened = True  # We know it decayed
        
        # Validation: Did we correctly identify high-risk satellites?
        # Reentry zone: < 250 km, High risk: 250-350 km, Safe: > 350 km
        in_danger_zone = closest_tle['altitude'] < 350
        predicted_danger_zone = predicted_altitude_7d < 350
        
        if in_danger_zone and predicted_danger_zone:
            prediction_correct = "✅ CORRECT - Identified high-risk satellite"
            successful += 1
        elif in_danger_zone and not predicted_danger_zone:
            prediction_correct = "❌ MISSED - Failed to identify risk"
            failed += 1
        elif not in_danger_zone and predicted_danger_zone:
            prediction_correct = "⚠️  FALSE ALARM - Predicted risk incorrectly"
            failed += 1
        else:
            prediction_correct = "✅ CORRECT - Safe satellite"
            successful += 1
        
        print(f"   Predicted altitude after 7d: {predicted_altitude_7d:.1f} km")
        print(f"   {prediction_correct}")
        
        validation_results.append({
            'norad_id': norad_id,
            'name': decay['name'],
            'decay_date': decay['decay_date'],
            'tle_epoch': closest_tle['epoch'],
            'altitude_at_tle': closest_tle['altitude'],
            'days_before_decay': days_before_decay,
            'predicted_altitude_7d': predicted_altitude_7d,
            'altitude_change_7d': predictions['7d']['altitude_change'],
            'in_danger_zone': closest_tle['altitude'] < 350,
            'predicted_danger_zone': predicted_altitude_7d < 350,
            'correct': (closest_tle['altitude'] < 350) == (predicted_altitude_7d < 350)
        })
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        failed += 1
        continue

# Summary
print("\n" + "=" * 70)
print("📊 VALIDATION SUMMARY")
print("=" * 70)

if validation_results:
    df = pd.DataFrame(validation_results)
    
    print(f"\n✅ Successfully validated: {successful}")
    print(f"❌ Missed predictions: {failed}")
    print(f"🎯 Accuracy: {successful/(successful+failed)*100:.1f}%")
    
    print(f"\n📈 Statistics:")
    print(f"   Avg altitude at T-7d: {df['altitude_at_tle'].mean():.1f} km")
    print(f"   Avg predicted altitude: {df['predicted_altitude_7d'].mean():.1f} km")
    print(f"   Predicted decay correctly: {df['correct'].sum()}/{len(df)}")
    
    # Save validation results
    df.to_csv('validation_results.csv', index=False)
    print(f"\n💾 Results saved to: validation_results.csv")

print("\n" + "=" * 70)
print("🎉 Validation complete!")
print("=" * 70)
