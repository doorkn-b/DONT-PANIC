"""
Orbital Decay Prediction Model
Train XGBoost on historical TLE + solar data, validate, then predict
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import pickle
import json

from spacetrack_client import SpaceTrackClient
from noaa_client import NOAAClient

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
import xgboost as xgb


class DecayPredictor:
    """Orbital decay prediction using XGBoost"""
    
    def __init__(self, spacetrack_username, spacetrack_password):
        self.st_client = SpaceTrackClient(spacetrack_username, spacetrack_password)
        self.noaa_client = NOAAClient()
        self.model = None
        self.feature_columns = None
        
    def collect_training_data(self, norad_id, days_back=120):
        """
        Collect and align historical TLE + solar data
        
        Returns:
            DataFrame with features and target
        """
        print(f"\n📦 Collecting training data for NORAD {norad_id}...")
        
        # Step 1: Get TLE history
        tle_history = self.st_client.get_tle_history(norad_id, days_back)
        
        if not tle_history or len(tle_history) < 10:
            print(f"❌ Insufficient TLE data: {len(tle_history) if tle_history else 0} records")
            return None
        
        # Convert to DataFrame
        df = pd.DataFrame(tle_history)
        df['epoch'] = pd.to_datetime(df['epoch'])
        df = df.sort_values('epoch').reset_index(drop=True)
        
        print(f"✅ Loaded {len(df)} TLE records")
        
        # Step 2: Get solar flux data for same period
        start_date = df['epoch'].min()
        end_date = df['epoch'].max()
        
        solar_data = self.noaa_client.get_historical_solar_flux(start_date, end_date)
        
        if solar_data:
            # Convert to DataFrame and merge
            solar_df = pd.DataFrame(solar_data)
            solar_df['date'] = pd.to_datetime(solar_df['date'])
            
            # Merge on date (match TLE epoch date with solar flux date)
            df['date'] = df['epoch'].dt.date
            solar_df['date'] = solar_df['date'].dt.date
            
            df = df.merge(solar_df, on='date', how='left')
            
            # Forward fill missing solar values
            df['f107'] = df['f107'].fillna(method='ffill').fillna(120.0)
            
            print(f"✅ Merged with solar flux data")
        else:
            print("⚠️  Using estimated solar flux")
            df['f107'] = 120.0
        
        # Step 3: Engineer features
        df = self._engineer_features(df)
        
        # Step 4: Create target variable (altitude change in next 7 days)
        df = self._create_target(df, horizon_days=7)
        
        # Remove rows with NaN (edges of time series)
        df = df.dropna()
        
        print(f"✅ Final dataset: {len(df)} samples with {len(self.feature_columns)} features")
        
        return df
    
    def _engineer_features(self, df):
        """Create features from raw data"""
        print("🔧 Engineering features...")
        
        # 1. Current altitude
        df['altitude_current'] = df['altitude']
        
        # 2. Recent decay rates (7-day and 30-day moving averages)
        df['altitude_7d_decay'] = df['altitude'].diff(7)  # Change over 7 days
        df['altitude_30d_decay'] = df['altitude'].diff(30)  # Change over 30 days
        
        # 3. Solar flux features
        df['f107_current'] = df['f107']
        df['f107_7d_avg'] = df['f107'].rolling(window=7, min_periods=1).mean()
        
        # 4. Interaction features
        df['drag_vulnerability'] = df['altitude_current'] * df['f107_current'] / 1000.0
        
        # 5. Orbital parameters
        df['mean_motion_current'] = df['mean_motion']
        df['eccentricity_current'] = df['eccentricity']
        df['inclination_current'] = df['inclination']
        
        # Feature columns for model
        self.feature_columns = [
            'altitude_current',
            'altitude_7d_decay',
            'altitude_30d_decay',
            'f107_current',
            'f107_7d_avg',
            'drag_vulnerability',
            'mean_motion_current',
            'eccentricity_current'
        ]
        
        return df
    
    def _create_target(self, df, horizon_days=7):
        """Create target variable: altitude change in next N days"""
        # Target = altitude[t+horizon] - altitude[t]
        df['target_altitude_change'] = df['altitude'].shift(-horizon_days) - df['altitude']
        return df
    
    def train_model(self, df, test_size=0.2):
        """
        Train XGBoost model with train/test split
        
        Args:
            df: DataFrame with features and target
            test_size: Fraction for test set
            
        Returns:
            dict with metrics
        """
        print(f"\n🤖 Training XGBoost model...")
        
        # Prepare data
        X = df[self.feature_columns]
        y = df['target_altitude_change']
        
        # Split chronologically (important for time series!)
        split_idx = int(len(df) * (1 - test_size))
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
        
        print(f"   Train: {len(X_train)} samples")
        print(f"   Test: {len(X_test)} samples")
        
        # Train XGBoost
        self.model = xgb.XGBRegressor(
            objective='reg:squarederror',
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42
        )
        
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False
        )
        
        # Evaluate
        train_pred = self.model.predict(X_train)
        test_pred = self.model.predict(X_test)
        
        metrics = {
            'train_rmse': np.sqrt(mean_squared_error(y_train, train_pred)),
            'test_rmse': np.sqrt(mean_squared_error(y_test, test_pred)),
            'train_r2': r2_score(y_train, train_pred),
            'test_r2': r2_score(y_test, test_pred),
            'test_mae': mean_absolute_error(y_test, test_pred),
            'feature_importance': dict(zip(self.feature_columns, 
                                          self.model.feature_importances_))
        }
        
        print(f"\n📊 Model Performance:")
        print(f"   Train RMSE: {metrics['train_rmse']:.3f} km")
        print(f"   Test RMSE: {metrics['test_rmse']:.3f} km")
        print(f"   Test R²: {metrics['test_r2']:.3f}")
        print(f"   Test MAE: {metrics['test_mae']:.3f} km")
        
        print(f"\n🎯 Feature Importance:")
        for feat, imp in sorted(metrics['feature_importance'].items(), 
                               key=lambda x: x[1], reverse=True):
            print(f"   {feat}: {imp:.3f}")
        
        return metrics
    
    def predict_decay(self, current_tle, current_solar, horizons=[7, 30, 90]):
        """
        Predict altitude decay for given horizons
        
        Args:
            current_tle: Dict with current TLE data
            current_solar: Dict with current solar conditions
            horizons: List of days ahead to predict
            
        Returns:
            Dict with predictions
        """
        if self.model is None:
            raise ValueError("Model not trained! Call train_model() first.")
        
        # Prepare features (same as training)
        # Handle different key names (altitude vs altitude_km, f107 vs solar_flux)
        altitude = current_tle.get('altitude', current_tle.get('altitude_km', 0))
        f107 = current_solar.get('f107', current_solar.get('solar_flux', 120))
        
        features = {
            'altitude_current': altitude,
            'altitude_7d_decay': 0,  # Would need recent history for this
            'altitude_30d_decay': 0,  # Would need recent history for this
            'f107_current': f107,
            'f107_7d_avg': f107,  # Approximation
            'drag_vulnerability': altitude * f107 / 1000.0,
            'mean_motion_current': current_tle['mean_motion'],
            'eccentricity_current': current_tle.get('eccentricity', 0.001)
        }
        
        X = pd.DataFrame([features])[self.feature_columns]
        
        # Predict for each horizon
        predictions = {}
        for horizon in horizons:
            # For now, scale the 7-day prediction
            # (Properly would retrain for each horizon)
            pred_change = self.model.predict(X)[0]
            scaled_change = pred_change * (horizon / 7.0)
            
            predictions[f'{horizon}d'] = {
                'predicted_altitude': round(altitude + scaled_change, 2),
                'altitude_change': round(scaled_change, 2),
                'decay_rate_m_per_day': round((scaled_change * 1000) / horizon, 1)
            }
        
        return predictions
    
    def save_model(self, filepath='decay_model.pkl'):
        """Save trained model"""
        if self.model is None:
            raise ValueError("No model to save")
        
        model_data = {
            'model': self.model,
            'feature_columns': self.feature_columns
        }
        
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
        
        print(f"✅ Model saved to {filepath}")
    
    def load_model(self, filepath='decay_model.pkl'):
        """Load trained model"""
        with open(filepath, 'rb') as f:
            model_data = pickle.load(f)
        
        self.model = model_data['model']
        self.feature_columns = model_data['feature_columns']
        
        print(f"✅ Model loaded from {filepath}")


# Main script
if __name__ == "__main__":
    import os
    
    # Get credentials from environment
    username = os.getenv('SPACETRACK_USERNAME')
    password = os.getenv('SPACETRACK_PASSWORD')
    
    if not username or not password:
        print("❌ Set SPACETRACK_USERNAME and SPACETRACK_PASSWORD environment variables")
        exit(1)
    
    print("=" * 60)
    print("🚀 ORBITAL DECAY PREDICTION MODEL")
    print("=" * 60)
    
    # Initialize predictor
    predictor = DecayPredictor(username, password)
    
    # Collect training data for ISS
    print("\n[1/4] Collecting Training Data...")
    train_data = predictor.collect_training_data(norad_id=25544, days_back=120)
    
    if train_data is None:
        print("❌ Failed to collect training data")
        exit(1)
    
    # Train model
    print("\n[2/4] Training Model...")
    metrics = predictor.train_model(train_data, test_size=0.25)
    
    # Save model
    print("\n[3/4] Saving Model...")
    predictor.save_model('iss_decay_model.pkl')
    
    # Test prediction
    print("\n[4/4] Testing Prediction...")
    current_tle = predictor.st_client.get_current_tle(25544)
    current_solar = predictor.noaa_client.get_solar_weather_data()
    
    if current_tle and current_solar:
        predictions = predictor.predict_decay(current_tle, current_solar)
        
        print(f"\n🔮 ISS Decay Predictions:")
        print(f"   Current altitude: {current_tle['altitude']} km")
        print(f"   Solar flux: {current_solar['solar_flux']} sfu")
        
        for horizon, pred in predictions.items():
            print(f"\n   {horizon} ahead:")
            print(f"      Altitude: {pred['predicted_altitude']} km")
            print(f"      Change: {pred['altitude_change']:.2f} km")
            print(f"      Decay rate: {pred['decay_rate_m_per_day']} m/day")
    
    print("\n" + "=" * 60)
    print("✅ COMPLETE!")
    print("=" * 60)
    
    # Save metrics for reference
    with open('model_metrics.json', 'w') as f:
        # Remove non-serializable objects
        save_metrics = {k: v for k, v in metrics.items() if k != 'model'}
        json.dump(save_metrics, f, indent=2)
    
    print("\n📄 Metrics saved to model_metrics.json")
