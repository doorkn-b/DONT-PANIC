"""
Batch prediction script for orbital decay
Predicts decay for multiple satellites and outputs JSON
"""
import os
import json
from datetime import datetime
from train_model import DecayPredictor
import numpy as np

# Get credentials from environment
username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

if not username or not password:
    print("❌ ERROR: Set credentials first:")
    print("   $env:SPACETRACK_USERNAME = 'arnabmukherjee791@gmail.com'")
    print("   $env:SPACETRACK_PASSWORD = 'Styro10.spacetrack'")
    exit(1)

# Satellite NORAD IDs to predict
# ISS + some Starlink satellites for demo
SATELLITES = [
    25544,  # ISS
    44713,  # Starlink-1007
    44714,  # Starlink-1008
    44715,  # Starlink-1009
    44716,  # Starlink-1010
    44717,  # Starlink-1011
    44718,  # Starlink-1012
    44719,  # Starlink-1013
    44720,  # Starlink-1014
    44721,  # Starlink-1015
]

def calculate_risk_score(altitude, decay_7d, decay_30d):
    """
    Calculate risk score 0-100 based on altitude and decay rate
    Higher score = higher risk of reentry
    """
    # Base risk from low altitude
    if altitude < 200:
        altitude_risk = 100
    elif altitude < 300:
        altitude_risk = 80
    elif altitude < 400:
        altitude_risk = 60
    elif altitude < 500:
        altitude_risk = 40
    else:
        altitude_risk = 20
    
    # Risk from decay rate (km/day)
    decay_rate = abs(decay_7d / 7.0)
    if decay_rate > 1.0:
        decay_risk = 100
    elif decay_rate > 0.5:
        decay_risk = 80
    elif decay_rate > 0.2:
        decay_risk = 60
    elif decay_rate > 0.1:
        decay_risk = 40
    else:
        decay_risk = 20
    
    # Combine (60% altitude, 40% decay rate)
    risk_score = int(0.6 * altitude_risk + 0.4 * decay_risk)
    return max(0, min(100, risk_score))

def get_risk_level(risk_score):
    """Convert risk score to text level"""
    if risk_score >= 80:
        return "CRITICAL"
    elif risk_score >= 60:
        return "HIGH"
    elif risk_score >= 40:
        return "MODERATE"
    elif risk_score >= 20:
        return "LOW"
    else:
        return "MINIMAL"

print("=" * 70)
print("🛰️  BATCH ORBITAL DECAY PREDICTION")
print("=" * 70)

# Load trained model
print("\n📦 Loading trained model...")
predictor = DecayPredictor(username, password)
predictor.load_model('iss_decay_model.pkl')
print("✅ Model loaded successfully")

# Get current solar conditions
print("\n☀️  Fetching current solar conditions...")
solar_data = predictor.noaa_client.get_current_solar_flux()
if solar_data:
    # Calculate density multiplier
    density_mult = predictor.noaa_client.calculate_density_multiplier(solar_data['f107'])
    solar_data['density_multiplier'] = density_mult
    print(f"   F10.7: {solar_data['f107']:.1f} sfu")
    print(f"   Density multiplier: {density_mult:.3f}x")
else:
    print("⚠️  Using default solar conditions (F10.7 = 120 sfu)")
    solar_data = {'f107': 120.0, 'density_multiplier': 1.0}

# Predict for each satellite
print(f"\n🎯 Predicting decay for {len(SATELLITES)} satellites...")
print("-" * 70)

results = []
successful = 0
failed = 0

for norad_id in SATELLITES:
    try:
        # Get current TLE
        tle_data = predictor.st_client.get_current_tle(norad_id)
        if not tle_data:
            print(f"⚠️  NORAD {norad_id}: No TLE data available")
            failed += 1
            continue
        
        # Make predictions (7, 30, 90 day horizons)
        pred_results = predictor.predict_decay(
            current_tle=tle_data,
            current_solar=solar_data,
            horizons=[7, 30, 90]
        )
        
        # Extract altitude changes from prediction results
        decay_7d = pred_results['7d']['altitude_change']
        decay_30d = pred_results['30d']['altitude_change']
        decay_90d = pred_results['90d']['altitude_change']
        
        # Calculate risk score
        risk_score = calculate_risk_score(
            altitude=tle_data['altitude_km'],
            decay_7d=decay_7d,
            decay_30d=decay_30d
        )
        
        risk_level = get_risk_level(risk_score)
        
        # Store result
        result = {
            'norad_id': int(norad_id),
            'name': tle_data.get('object_name', f'SAT-{norad_id}'),
            'epoch': tle_data['epoch'],
            'current_altitude': float(tle_data['altitude_km']),
            'inclination': float(tle_data['inclination']),
            'eccentricity': float(tle_data['eccentricity']),
            'predictions': {
                '7_day': float(decay_7d),
                '30_day': float(decay_30d),
                '90_day': float(decay_90d)
            },
            'decay_rate_km_per_day': float(decay_7d / 7.0),
            'risk_score': risk_score,
            'risk_level': risk_level,
            'predicted_at': datetime.now().isoformat()
        }
        
        results.append(result)
        
        # Print summary
        status = "🔴" if risk_score >= 60 else "🟡" if risk_score >= 40 else "🟢"
        print(f"{status} NORAD {norad_id:5d}: {tle_data['altitude_km']:6.1f} km → "
              f"{decay_7d:+6.2f} km (7d) | Risk: {risk_score:3d}/100 ({risk_level})")
        
        successful += 1
        
    except Exception as e:
        print(f"❌ NORAD {norad_id}: Error - {str(e)}")
        failed += 1
        continue

# Save results
print("\n" + "=" * 70)
print(f"✅ Predictions complete: {successful} successful, {failed} failed")
print("=" * 70)

output_file = 'predictions.json'
with open(output_file, 'w') as f:
    output = {
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'model_version': 'iss_decay_model_v1',
            'total_satellites': len(SATELLITES),
            'successful_predictions': successful,
            'failed_predictions': failed,
            'solar_conditions': {
                'f107': float(solar_data['f107']),
                'density_multiplier': float(solar_data['density_multiplier'])
            }
        },
        'predictions': results
    }
    json.dump(output, f, indent=2)

print(f"\n💾 Results saved to: {output_file}")

# Print summary statistics
if results:
    altitudes = [r['current_altitude'] for r in results]
    risks = [r['risk_score'] for r in results]
    decay_rates = [r['decay_rate_km_per_day'] for r in results]
    
    print(f"\n📊 Summary Statistics:")
    print(f"   Altitude range: {min(altitudes):.1f} - {max(altitudes):.1f} km")
    print(f"   Average risk: {np.mean(risks):.1f}/100")
    print(f"   Decay rate range: {min(decay_rates):.4f} - {max(decay_rates):.4f} km/day")
    
    high_risk = sum(1 for r in risks if r >= 60)
    moderate_risk = sum(1 for r in risks if 40 <= r < 60)
    low_risk = sum(1 for r in risks if r < 40)
    
    print(f"\n🚨 Risk Distribution:")
    print(f"   High risk (60+): {high_risk} satellites")
    print(f"   Moderate (40-59): {moderate_risk} satellites")
    print(f"   Low (<40): {low_risk} satellites")

print("\n" + "=" * 70)
print("🎉 Batch prediction complete!")
print("=" * 70)
