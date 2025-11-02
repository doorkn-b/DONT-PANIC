"""
Train orbital decay model on ISS data
"""
import os
from train_model import DecayPredictor

# Get credentials from environment
username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

if not username or not password:
    print("❌ ERROR: Set credentials first:")
    print("   $env:SPACETRACK_USERNAME = 'arnabmukherjee791@gmail.com'")
    print("   $env:SPACETRACK_PASSWORD = 'Styro10.spacetrack'")
    exit(1)

print("=" * 70)
print("🚀 ORBITAL DECAY MODEL TRAINING")
print("=" * 70)

# Create predictor
predictor = DecayPredictor(username, password)

# Collect training data for ISS (90 days)
print("\n📊 Phase 1: Data Collection")
print("-" * 70)
df = predictor.collect_training_data(norad_id=25544, days_back=90)

if df is None:
    print("❌ Failed to collect data")
    exit(1)

# Train model
print("\n🤖 Phase 2: Model Training")
print("-" * 70)
metrics = predictor.train_model(df, test_size=0.25)

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
predictor.save_model('iss_decay_model.pkl')
print(f"   Model saved to: iss_decay_model.pkl")

# Save metrics (convert numpy types to Python native types)
with open('model_metrics.json', 'w') as f:
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
print(f"   Metrics saved to: model_metrics.json")

print("\n" + "=" * 70)
print("🎉 Model ready for predictions!")
print("=" * 70)
