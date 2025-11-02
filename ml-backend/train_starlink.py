"""
Train orbital decay model on DECAYING STARLINK satellites
Uses satellites with actual decay history for realistic predictions
"""
import os
from train_model import DecayPredictor
import pandas as pd

# Get credentials from environment
username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

if not username or not password:
    print("❌ ERROR: Set credentials first:")
    print("   $env:SPACETRACK_USERNAME = 'arnabmukherjee791@gmail.com'")
    print("   $env:SPACETRACK_PASSWORD = 'Styro10.spacetrack'")
    exit(1)

print("=" * 70)
print("🚀 ORBITAL DECAY MODEL TRAINING - STARLINK EDITION")
print("=" * 70)
print("Training on satellites with REAL decay patterns")
print("=" * 70)

# Create predictor
predictor = DecayPredictor(username, password)

# Use Starlink satellites that have decayed or are decaying
# These have much faster decay rates than ISS
TRAINING_SATELLITES = [
    45084,  # STARLINK-1173 (decayed Nov 2, 2025)
    48484,  # STARLINK-2696 (decayed Nov 2, 2025)
    46169,  # STARLINK-1628 (decayed Nov 2, 2025)
    45774,  # STARLINK-1485 (decayed Nov 2, 2025)
    # Add some that are still in orbit but decaying
    44713,  # STARLINK-1007 (200 km - high decay)
    44714,  # STARLINK-1008 (554 km)
    44718,  # STARLINK-1012 (554 km)
]

print(f"\n📊 Phase 1: Data Collection from {len(TRAINING_SATELLITES)} satellites")
print("-" * 70)

all_data = []

for i, norad_id in enumerate(TRAINING_SATELLITES, 1):
    print(f"\n[{i}/{len(TRAINING_SATELLITES)}] Collecting data for NORAD {norad_id}...")
    
    try:
        df = predictor.collect_training_data(norad_id=norad_id, days_back=90)
        
        if df is not None and len(df) > 10:
            all_data.append(df)
            print(f"✅ Collected {len(df)} samples")
        else:
            print(f"⚠️  Insufficient data ({len(df) if df is not None else 0} samples)")
    except Exception as e:
        print(f"❌ Error: {e}")
        continue

if len(all_data) == 0:
    print("\n❌ No training data collected")
    exit(1)

# Combine all data
print(f"\n📊 Combining data from {len(all_data)} satellites...")
combined_df = pd.concat(all_data, ignore_index=True)
print(f"✅ Total training samples: {len(combined_df)}")

# Show altitude distribution
print(f"\n📈 Altitude distribution:")
print(f"   Min: {combined_df['altitude_current'].min():.1f} km")
print(f"   Max: {combined_df['altitude_current'].max():.1f} km")
print(f"   Mean: {combined_df['altitude_current'].mean():.1f} km")
print(f"   Median: {combined_df['altitude_current'].median():.1f} km")

# Train model
print("\n🤖 Phase 2: Model Training")
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

# Save model
print(f"\n💾 Saving model...")
predictor.save_model('starlink_decay_model.pkl')
print(f"   Model saved to: starlink_decay_model.pkl")

# Save metrics
with open('starlink_model_metrics.json', 'w') as f:
    import json
    import numpy as np
    
    def convert_numpy(obj):
        """Convert numpy types to Python native types"""
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
print(f"   Metrics saved to: starlink_model_metrics.json")

print("\n" + "=" * 70)
print("🎉 Starlink decay model ready!")
print("=" * 70)
print("\n💡 This model is trained on satellites with REAL decay patterns")
print("   and should handle low-altitude predictions much better!")
