"""
Flask API for Orbital Decay Predictions
Serves hybrid physics + ML model predictions
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import pickle
import os
from datetime import datetime
from train_hybrid import HybridDecayPredictor

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Load model at startup
print("🚀 Loading hybrid decay model...")
with open('hybrid_decay_model.pkl', 'rb') as f:
    model_data = pickle.load(f)

# Get credentials from environment
username = os.getenv('SPACETRACK_USERNAME', 'arnabmukherjee791@gmail.com')
password = os.getenv('SPACETRACK_PASSWORD', 'Styro10.spacetrack')

# Initialize predictor
predictor = HybridDecayPredictor(username, password)
predictor.risk_model = model_data['risk_model']
predictor.H = model_data['H']
predictor.rho_ref = model_data['rho_ref']
predictor.h_ref = model_data['h_ref']

print("✅ Model loaded successfully!")


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model': 'hybrid_physics_ml',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/satellite/<int:norad_id>', methods=['GET'])
def get_satellite(norad_id):
    """
    Get satellite decay prediction and historical data
    
    Returns:
    - Current TLE data
    - Model predictions (7, 30, 90 day)
    - Risk score
    - Historical decay data from Space-Track
    """
    try:
        print(f"\n📡 Fetching data for NORAD {norad_id}...")
        
        # Get current TLE
        tle_data = predictor.st_client.get_current_tle(norad_id)
        if not tle_data:
            return jsonify({'error': 'Satellite not found'}), 404
        
        # Get solar conditions
        solar_data = predictor.noaa_client.get_current_solar_flux()
        
        # Make predictions
        predictions = predictor.predict(tle_data, solar_data, horizons=[7, 30, 90])
        
        # Get historical decay data (last 90 days)
        print(f"📜 Fetching historical decay data...")
        tle_history = predictor.st_client.get_tle_history(norad_id, days_back=90)
        
        # Format historical data
        historical = []
        if tle_history:
            for tle in tle_history:
                # Calculate altitude from mean motion if needed
                if 'altitude_km' not in tle and 'altitude' in tle:
                    altitude = tle['altitude']
                elif 'altitude_km' in tle:
                    altitude = tle['altitude_km']
                else:
                    # Calculate from mean motion
                    import numpy as np
                    GM = 398600.4418
                    altitude = ((GM * (86400 / (2 * np.pi * tle['mean_motion']))**2)**(1/3)) - 6371
                
                historical.append({
                    'epoch': tle['epoch'],
                    'altitude_km': float(altitude),
                    'mean_motion': float(tle.get('mean_motion', 0)),
                    'eccentricity': float(tle.get('eccentricity', 0))
                })
        
        # Sort by epoch
        historical.sort(key=lambda x: x['epoch'])
        
        # Calculate actual decay rate if we have history
        actual_decay_rate = None
        if len(historical) >= 2:
            # Use first and last points
            first = historical[0]
            last = historical[-1]
            days_diff = (datetime.fromisoformat(last['epoch'].replace('Z', '+00:00')) - 
                        datetime.fromisoformat(first['epoch'].replace('Z', '+00:00'))).days
            if days_diff > 0:
                alt_diff = last['altitude_km'] - first['altitude_km']
                actual_decay_rate = alt_diff / days_diff
        
        # Build response
        response = {
            'norad_id': norad_id,
            'satellite_name': tle_data.get('name', f'NORAD {norad_id}'),
            'current_state': {
                'epoch': tle_data.get('epoch'),
                'altitude_km': tle_data.get('altitude_km', tle_data.get('altitude')),
                'eccentricity': tle_data.get('eccentricity'),
                'mean_motion': tle_data.get('mean_motion'),
                'inclination': tle_data.get('inclination')
            },
            'solar_conditions': {
                'f107': solar_data.get('f107', solar_data.get('solar_flux')),
                'observed_time': solar_data.get('time_tag', solar_data.get('observed_time'))
            },
            'predictions': {
                '7_day': predictions['predictions']['7d'],
                '30_day': predictions['predictions']['30d'],
                '90_day': predictions['predictions']['90d']
            },
            'risk_assessment': {
                'risk_score': predictions['risk_score'],
                'confidence': predictions['confidence'],
                'method': predictions['method']
            },
            'historical_data': historical,
            'actual_decay_rate': actual_decay_rate,
            'timestamp': datetime.now().isoformat()
        }
        
        print(f"✅ Generated prediction for {response['satellite_name']}")
        print(f"   Altitude: {response['current_state']['altitude_km']:.2f} km")
        print(f"   Risk: {predictions['risk_score']}/100")
        print(f"   7-day prediction: {predictions['predictions']['7d']['change_km']:+.2f} km")
        
        return jsonify(response)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/predictions', methods=['GET'])
def get_all_predictions():
    """
    Get predictions for multiple satellites
    Query params:
    - norad_ids: comma-separated list of NORAD IDs
    - limit: max number of results (default 10)
    """
    try:
        norad_ids_param = request.args.get('norad_ids', '')
        limit = int(request.args.get('limit', 10))
        
        if not norad_ids_param:
            # Default: Some interesting satellites
            norad_ids = [25544, 48274, 47926, 48275, 48276]  # ISS + some Starlinks
        else:
            norad_ids = [int(x.strip()) for x in norad_ids_param.split(',')]
        
        # Limit to prevent abuse
        norad_ids = norad_ids[:min(limit, 50)]
        
        results = []
        for norad_id in norad_ids:
            try:
                # Get basic prediction (no heavy historical data)
                tle_data = predictor.st_client.get_current_tle(norad_id)
                if not tle_data:
                    continue
                
                solar_data = predictor.noaa_client.get_current_solar_flux()
                predictions = predictor.predict(tle_data, solar_data, horizons=[7, 30])
                
                results.append({
                    'norad_id': norad_id,
                    'name': tle_data.get('name', f'NORAD {norad_id}'),
                    'altitude_km': tle_data.get('altitude_km', tle_data.get('altitude')),
                    'risk_score': predictions['risk_score'],
                    'decay_7d': predictions['predictions']['7d']['change_km'],
                    'decay_30d': predictions['predictions']['30d']['change_km']
                })
            except Exception as e:
                print(f"⚠️  Error getting prediction for {norad_id}: {e}")
                continue
        
        return jsonify({
            'satellites': results,
            'count': len(results),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/solar', methods=['GET'])
def get_solar():
    """Get current solar conditions and forecast"""
    try:
        current = predictor.noaa_client.get_current_solar_flux()
        kp = predictor.noaa_client.get_kp_index()
        forecast = predictor.noaa_client.get_27day_forecast()
        
        return jsonify({
            'current': {
                'f107': current.get('f107', current.get('solar_flux')),
                'observed_time': current.get('time_tag', current.get('observed_time'))
            },
            'geomagnetic': {
                'kp': kp.get('kp'),
                'g_scale': kp.get('g_scale'),
                'time': kp.get('time_tag')
            },
            'forecast_27day': forecast,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/space-weather/realtime', methods=['GET'])
def get_realtime_space_weather():
    """
    Get real-time space weather data for dashboard graphs:
    - GOES X-ray flux (6 hours)
    - Solar wind speed & density (24 hours)
    - Planetary K-index (24 hours)
    """
    try:
        print("\n📊 Fetching real-time space weather data...")
        
        # Get time series data
        xray_data = predictor.noaa_client.get_xray_flux_6hour()
        solar_wind_data_full = predictor.noaa_client.get_solar_wind_24hour()
        kp_data = predictor.noaa_client.get_planetary_k_index_24hour()
        
        # Reduce solar wind data - take every 5th point for last 6 hours (~72 points)
        # Solar wind updates every minute, so we have ~1440 points per day
        # Show last 360 points (6 hours), sample every 5 points = 72 points
        solar_wind_data = solar_wind_data_full[-360::5] if len(solar_wind_data_full) > 360 else solar_wind_data_full[::5]
        
        # Get current values
        xray_current = predictor.noaa_client.get_xray_flux()
        solar_wind_current = predictor.noaa_client.get_solar_wind()
        kp_current = predictor.noaa_client.get_kp_index()
        
        print(f"✅ Retrieved {len(xray_data)} X-ray points, {len(solar_wind_data)} solar wind points (sampled from {len(solar_wind_data_full)}), {len(kp_data)} K-index points")
        
        return jsonify({
            'xray_flux': {
                'current': xray_current,
                'history_6h': xray_data
            },
            'solar_wind': {
                'current': solar_wind_current,
                'history_24h': solar_wind_data
            },
            'kp_index': {
                'current': kp_current,
                'history_24h': kp_data
            },
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Error fetching real-time space weather: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/recent-decays', methods=['GET'])
def get_recent_decays():
    """
    Get the last 10 satellites that have decayed
    Sorted by decay date (most recent first)
    """
    try:
        import requests
        from datetime import datetime, timedelta
        
        print("🛰️ Fetching recent decayed satellites from Space-Track...")
        
        # Login to Space-Track
        session = requests.Session()
        login_url = 'https://www.space-track.org/ajaxauth/login'
        login_data = {
            'identity': username,
            'password': password
        }
        
        login_resp = session.post(login_url, data=login_data)
        if login_resp.status_code != 200:
            return jsonify({'error': 'Failed to authenticate with Space-Track'}), 500
        
        # Query SATCAT for recently decayed satellites
        # Get satellites that decayed in the last 30 days, sorted by decay date descending
        today = datetime.now()
        thirty_days_ago = today - timedelta(days=30)
        
        query_url = (
            f'https://www.space-track.org/basicspacedata/query/class/satcat/'
            f'decay/{thirty_days_ago.strftime("%Y-%m-%d")}--{today.strftime("%Y-%m-%d")}/'
            f'orderby/DECAY desc/limit/10/format/json'
        )
        
        print(f"  Querying: {query_url}")
        resp = session.get(query_url)
        
        if resp.status_code != 200:
            return jsonify({'error': f'Space-Track returned {resp.status_code}'}), 500
        
        data = resp.json()
        
        # Format the response
        decayed_satellites = []
        for sat in data:
            decayed_satellites.append({
                'norad_id': sat.get('NORAD_CAT_ID'),
                'name': sat.get('SATNAME'),
                'intldes': sat.get('INTLDES'),
                'object_type': sat.get('OBJECT_TYPE'),
                'country': sat.get('COUNTRY'),
                'launch_date': sat.get('LAUNCH'),
                'launch_site': sat.get('SITE'),
                'decay_date': sat.get('DECAY'),
                'period': sat.get('PERIOD'),
                'inclination': sat.get('INCLINATION'),
                'apogee': sat.get('APOGEE'),
                'perigee': sat.get('PERIGEE'),
                'rcs_size': sat.get('RCS_SIZE')
            })
        
        print(f"✅ Found {len(decayed_satellites)} recently decayed satellites")
        
        return jsonify({
            'success': True,
            'count': len(decayed_satellites),
            'satellites': decayed_satellites,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Error fetching recent decays: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("\n" + "=" * 80)
    print("🌍 ORBITAL DECAY API SERVER")
    print("=" * 80)
    print("\nEndpoints:")
    print("  GET /api/health                      - Health check")
    print("  GET /api/satellite/<norad_id>        - Full satellite data + predictions")
    print("  GET /api/predictions?norad_ids=...   - Batch predictions")
    print("  GET /api/solar                       - Solar weather conditions")
    print("  GET /api/space-weather/realtime      - Real-time space weather graphs")
    print("  GET /api/recent-decays               - Last 10 decayed satellites")
    print("\n" + "=" * 80)
    print("🚀 Starting server on http://localhost:5000")
    print("=" * 80 + "\n")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
