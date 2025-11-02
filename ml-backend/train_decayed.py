"""
Train on Starlink satellites that ACTUALLY DECAYED
Uses real decay data to find the best training candidates
"""
import os
from train_model import DecayPredictor
import pandas as pd
from datetime import datetime

# Get credentials
username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

if not username or not password:
    print("❌ ERROR: Set credentials first")
    exit(1)

print("=" * 70)
print("🚀 TRAINING ON DECAYED STARLINK SATELLITES")
print("=" * 70)

# Create predictor
predictor = DecayPredictor(username, password)

# Step 1: Find Starlink satellites that decayed recently
print("\n📊 Step 1: Finding decayed Starlink satellites...")
decays = predictor.st_client.get_decay_data(days_back=60)

# Filter for Starlink only
starlink_decays = [d for d in decays if 'STARLINK' in d['name'].upper()]
print(f"✅ Found {len(starlink_decays)} Starlink satellites that decayed")

# Filter for historical (already decayed)
now = datetime.now()
historical = [d for d in starlink_decays 
              if datetime.strptime(d['decay_date'].replace(' 0:', ' 00:'), '%Y-%m-%d %H:%M:%S') < now]
print(f"✅ {len(historical)} have already decayed (historical data)")

# Step 2: Collect training data from decayed satellites
print(f"\n📊 Step 2: Collecting TLE history from decayed satellites")
print("-" * 70)

all_data = []
successful = 0

# Use top 15 recently decayed Starlinks
for i, decay in enumerate(historical[:15], 1):
    norad_id = int(decay['norad_id'])
    name = decay['name']
    decay_date = decay['decay_date']
    
    print(f"\n[{i}/15] {name} (NORAD {norad_id})")
    print(f"   Decayed: {decay_date}")
    
    try:
        # Get TLE history up to 90 days before decay
        df = predictor.collect_training_data(norad_id=norad_id, days_back=90)
        
        if df is not None and len(df) > 30:  # Need at least 30 samples
            all_data.append(df)
            print(f"   ✅ Collected {len(df)} samples")
            
            # Show altitude range
            min_alt = df['altitude_current'].min()
            max_alt = df['altitude_current'].max()
            print(f"   📈 Altitude: {min_alt:.1f} - {max_alt:.1f} km")
            successful += 1
        else:
            print(f"   ⚠️  Insufficient data ({len(df) if df is not None else 0} samples)")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        continue
    
    # Stop if we have enough data
    if successful >= 10:
        print(f"\n✅ Collected enough data from {successful} satellites")
        break

if len(all_data) == 0:
    print("\n❌ No training data collected")
    exit(1)

# Step 3: Combine and filter for low altitudes only
print(f"\n📊 Step 3: Combining data from {len(all_data)} satellites...")
combined_df = pd.concat(all_data, ignore_index=True)
print(f"✅ Total training samples: {len(combined_df)}")

# Filter for low altitudes where decay is significant (< 400 km)
print(f"\n🔍 Filtering for low-altitude samples (< 400 km)...")
low_alt_df = combined_df[combined_df['altitude_current'] < 400].copy()
print(f"✅ Filtered to {len(low_alt_df)} samples (from {len(combined_df)})")

combined_df = low_alt_df

print(f"\n📈 Dataset statistics:")
print(f"   Altitude range: {combined_df['altitude_current'].min():.1f} - {combined_df['altitude_current'].max():.1f} km")
print(f"   Mean altitude: {combined_df['altitude_current'].mean():.1f} km")
print(f"   Median altitude: {combined_df['altitude_current'].median():.1f} km")
print(f"   F10.7 range: {combined_df['f107_current'].min():.0f} - {combined_df['f107_current'].max():.0f} sfu")

# Show target (7-day decay) distribution
if 'target' in combined_df.columns:
    print(f"\n📉 7-day altitude changes:")
    print(f"   Mean: {combined_df['target'].mean():.2f} km")
    print(f"   Median: {combined_df['target'].median():.2f} km")
    print(f"   Min (fastest decay): {combined_df['target'].min():.2f} km")
    print(f"   Max (slowest decay): {combined_df['target'].max():.2f} km")

# Step 4: Train model
print("\n🤖 Step 4: Training XGBoost model...")
print("-" * 70)
metrics = predictor.train_model(combined_df, test_size=0.25)

# Print results
print("\n" + "=" * 70)
print("✅ TRAINING COMPLETE!")
print("=" * 70)
print(f"\n📈 Model Performance:")
print(f"   Training RMSE:   {metrics['train_rmse']:.4f} km")
print(f"   Test RMSE:       {metrics['test_rmse']:.4f} km")
print(f"   Training R²:     {metrics['train_r2']:.4f}")
print(f"   Test R²:         {metrics['test_r2']:.4f}")
print(f"   Test MAE:        {metrics['test_mae']:.4f} km")

if metrics['test_r2'] < 0:
    print(f"\n⚠️  WARNING: Negative R² indicates poor model fit!")
    print(f"   Model is worse than predicting the mean value.")
else:
    print(f"\n✅ Model explains {metrics['test_r2']*100:.1f}% of variance")

# Save model
print(f"\n💾 Saving model...")
predictor.save_model('decayed_starlink_model.pkl')
print(f"   Model saved to: decayed_starlink_model.pkl")

# Save metrics
with open('decayed_starlink_metrics.json', 'w') as f:
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
    
    metrics_serializable = convert_numpy(metrics)
    json.dump(metrics_serializable, f, indent=2)
print(f"   Metrics saved to: decayed_starlink_metrics.json")

print("\n" + "=" * 70)
print("🎉 Model trained on REAL decay trajectories!")
print("=" * 70)
