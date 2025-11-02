"""
ROBUST MODEL TRAINING - Collect data from MANY decayed Starlinks
Goal: Train on 50+ satellites to capture the full decay spectrum
"""
import os
from train_model import DecayPredictor
import pandas as pd
from datetime import datetime
import time

# Get credentials
username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

if not username or not password:
    print("❌ ERROR: Set credentials first")
    exit(1)

print("=" * 70)
print("🚀 ROBUST MODEL TRAINING - LARGE DATASET")
print("=" * 70)

# Create predictor
predictor = DecayPredictor(username, password)

# Get LOTS of decayed Starlinks
print("\n📊 Step 1: Finding decayed Starlink satellites...")
decays = predictor.st_client.get_decay_data(days_back=90)  # Extend to 90 days

# Filter for Starlink only
starlink_decays = [d for d in decays if 'STARLINK' in d['name'].upper()]
print(f"✅ Found {len(starlink_decays)} Starlink satellites that decayed")

# Filter for historical (already decayed)
now = datetime.now()
historical = [d for d in starlink_decays 
              if datetime.strptime(d['decay_date'].replace(' 0:', ' 00:'), '%Y-%m-%d %H:%M:%S') < now]
print(f"✅ {len(historical)} have already decayed (historical data)")

# Remove duplicates by NORAD ID
unique_sats = {}
for decay in historical:
    norad_id = int(decay['norad_id'])
    if norad_id not in unique_sats:
        unique_sats[norad_id] = decay

historical = list(unique_sats.values())
print(f"✅ {len(historical)} unique satellites after deduplication")

# Collect from MANY satellites (target: 50+)
print(f"\n📊 Step 2: Collecting TLE history from {min(len(historical), 60)} satellites")
print("   (This will take a while - respecting rate limits)")
print("-" * 70)

all_data = []
successful = 0
failed = 0
target_samples = 3000  # Target at least 3000 training samples

for i, decay in enumerate(historical[:60], 1):  # Try up to 60 satellites
    norad_id = int(decay['norad_id'])
    name = decay['name']
    
    print(f"\n[{i}] {name} (NORAD {norad_id})")
    
    try:
        # Get TLE history
        df = predictor.collect_training_data(norad_id=norad_id, days_back=120)  # Longer history
        
        if df is not None and len(df) > 20:  # At least 20 samples
            all_data.append(df)
            successful += 1
            
            min_alt = df['altitude_current'].min()
            max_alt = df['altitude_current'].max()
            print(f"   ✅ {len(df)} samples | Altitude: {min_alt:.0f}-{max_alt:.0f} km")
            
            # Check if we have enough data
            total_samples = sum(len(d) for d in all_data)
            print(f"   📊 Total samples: {total_samples}/{target_samples}")
            
            if total_samples >= target_samples:
                print(f"\n✅ Reached target of {target_samples} samples!")
                break
        else:
            print(f"   ⚠️  Insufficient data")
            failed += 1
            
    except Exception as e:
        print(f"   ❌ Error: {str(e)[:100]}")
        failed += 1
        continue
    
    # Rate limit: 30 req/min, so wait 2 seconds between satellites
    if i < len(historical):
        time.sleep(2)

print(f"\n📊 Data Collection Summary:")
print(f"   Successful: {successful} satellites")
print(f"   Failed: {failed} satellites")

if len(all_data) < 10:
    print("\n❌ Not enough data collected (need at least 10 satellites)")
    exit(1)

# Combine all data
print(f"\n📊 Step 3: Combining data from {len(all_data)} satellites...")
combined_df = pd.concat(all_data, ignore_index=True)
print(f"✅ Total training samples: {len(combined_df)}")

# Show comprehensive statistics
print(f"\n📈 Dataset Statistics:")
print(f"   Total samples: {len(combined_df)}")
print(f"   Satellites: {successful}")
print(f"   Samples per satellite: {len(combined_df)/successful:.1f} avg")
print(f"\n   Altitude:")
print(f"      Min: {combined_df['altitude_current'].min():.1f} km")
print(f"      Max: {combined_df['altitude_current'].max():.1f} km")
print(f"      Mean: {combined_df['altitude_current'].mean():.1f} km")
print(f"      Median: {combined_df['altitude_current'].median():.1f} km")
print(f"\n   Solar Flux (F10.7):")
print(f"      Min: {combined_df['f107_current'].min():.0f} sfu")
print(f"      Max: {combined_df['f107_current'].max():.0f} sfu")
print(f"      Mean: {combined_df['f107_current'].mean():.0f} sfu")

# Show 7-day decay distribution
if 'target' in combined_df.columns:
    print(f"\n   7-Day Altitude Change (target):")
    print(f"      Min: {combined_df['target'].min():.2f} km")
    print(f"      Max: {combined_df['target'].max():.2f} km")
    print(f"      Mean: {combined_df['target'].mean():.2f} km")
    print(f"      Median: {combined_df['target'].median():.2f} km")

# Train model
print("\n🤖 Step 4: Training XGBoost model with tuned hyperparameters...")
print("-" * 70)

# Use larger test set for better validation
metrics = predictor.train_model(combined_df, test_size=0.3)

# Print results
print("\n" + "=" * 70)
print("✅ TRAINING COMPLETE!")
print("=" * 70)
print(f"\n📈 Model Performance:")
print(f"   Training samples: {int(len(combined_df) * 0.7)}")
print(f"   Test samples: {int(len(combined_df) * 0.3)}")
print(f"   Training RMSE: {metrics['train_rmse']:.4f} km")
print(f"   Test RMSE: {metrics['test_rmse']:.4f} km")
print(f"   Training R²: {metrics['train_r2']:.4f}")
print(f"   Test R²: {metrics['test_r2']:.4f}")
print(f"   Test MAE: {metrics['test_mae']:.4f} km")

# Interpret results
if metrics['test_r2'] > 0.8:
    print(f"\n✅ EXCELLENT model fit! Explains {metrics['test_r2']*100:.1f}% of variance")
elif metrics['test_r2'] > 0.5:
    print(f"\n✅ GOOD model fit! Explains {metrics['test_r2']*100:.1f}% of variance")
elif metrics['test_r2'] > 0:
    print(f"\n⚠️  MODERATE model fit. Explains {metrics['test_r2']*100:.1f}% of variance")
else:
    print(f"\n❌ POOR model fit. R² is negative ({metrics['test_r2']:.4f})")
    print(f"   Model performs worse than predicting mean value")

# Save model
model_filename = 'robust_starlink_model.pkl'
print(f"\n💾 Saving model...")
predictor.save_model(model_filename)
print(f"   Model saved to: {model_filename}")

# Save metrics and dataset info
with open('robust_starlink_metrics.json', 'w') as f:
    import json
    import numpy as np
    
    def convert_numpy(obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {k: convert_numpy(v) for k, v in obj.items()}
        else:
            return obj
    
    output = {
        'model_metrics': convert_numpy(metrics),
        'dataset_info': {
            'total_samples': len(combined_df),
            'num_satellites': successful,
            'altitude_min': float(combined_df['altitude_current'].min()),
            'altitude_max': float(combined_df['altitude_current'].max()),
            'altitude_mean': float(combined_df['altitude_current'].mean()),
        }
    }
    json.dump(output, f, indent=2)

print(f"   Metrics saved to: robust_starlink_metrics.json")

print("\n" + "=" * 70)
print("🎉 ROBUST MODEL READY!")
print("=" * 70)
print(f"\nTrained on {successful} satellites with {len(combined_df)} samples")
print(f"Covers altitudes from {combined_df['altitude_current'].min():.0f} to {combined_df['altitude_current'].max():.0f} km")
