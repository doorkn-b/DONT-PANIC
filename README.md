# 🛰️ DONT PANIC

**Real-time satellite tracking and orbital decay prediction platform**

DONT PANIC is a comprehensive space situational awareness tool that combines real-time satellite tracking, machine learning-powered decay predictions, and live space weather monitoring in an interactive 3D visualization.

## ✨ Features

### 🌍 Real-Time 3D Visualization
- **100 satellites** tracked simultaneously across 7 categories (Starlink, ISS, GPS, Weather, Geostationary, Amateur, Brightest)
- **Color-coded orbits** with complete circular paths rendered at 60 FPS
- **Interactive Earth model** with day/night textures and atmospheric glow
- **Click-to-inspect** any satellite for detailed orbital parameters

### 🤖 ML-Powered Decay Predictions
- **Hybrid XGBoost ensemble** trained on 50,000+ historical decay records
- **7/30/90-day forecasts** with altitude change and daily decay rates
- **Risk assessment scoring** (0-100) with confidence intervals
- **87% accuracy** on 7-day predictions, validated on 2023-2024 data

### 📊 Live Space Weather Integration
- **NOAA SWPC data streams**: X-ray flux, K-index, solar wind, proton flux
- **Real-time alerts** for geomagnetic storms and solar flares
- **3-day forecasts** for space weather conditions
- **Interactive charts** with Recharts visualization library

### 🔍 Historical Satellite Lookup
- Search any satellite by **NORAD ID** or name
- Query **Space-Track archives** for historical TLE data
- View orbital parameters at any past date
- Access complete SATCAT metadata

### 📉 Recent Decays Tracker
- Top 10 most recently decayed satellites (last 30 days)
- Real-time Space-Track API integration
- Detailed decay information: launch date, site, orbital parameters, object type

## 🏗️ Architecture

### Frontend
- **React** + **Three.js** for 3D rendering
- **satellite.js** for SGP4 orbital propagation
- **Recharts** for space weather visualization
- Port: 3000

### Backend - Node.js Proxy
- **Express** server proxying N2YO API
- Handles CORS and rate limiting
- Port: 3001

### Backend - Python ML API
- **Flask** REST API
- **XGBoost** models for decay prediction
- **Space-Track** and **NOAA** clients
- Port: 5000

## 📡 Data Sources

1. **Space-Track.org** - SATCAT database, decay records, TLE archives
2. **N2YO.com** - Real-time satellite positions (100 requests/hour)
3. **NOAA SWPC** - Space weather observations, forecasts, and models

## 🚀 Quick Start

1. Clone the repository
2. Install dependencies: `npm install` (frontend), `npm install` (backend), `pip install -r requirements.txt` (ML backend)
3. Set environment variables for Space-Track credentials
4. Start all services:
   - Frontend: `npm start`
   - Backend: `node backend/server-simple.js`
   - ML API: `python ml-backend/api.py`
5. Open http://localhost:3000

## 🎯 Tech Stack

**Frontend:** React, Three.js, satellite.js, Recharts  
**Backend:** Node.js, Express, Flask, Python  
**ML:** XGBoost, scikit-learn, pandas, numpy  
**APIs:** Space-Track, N2YO, NOAA SWPC  
**Rendering:** WebGL, GLSL shaders  

## 📈 Key Metrics

- **100 satellites** tracked in real-time
- **8+ data streams** from NOAA SWPC
- **50,000+ training samples** for ML models
- **12,000+ lines of code** (excluding dependencies)
- **87% accuracy** on 7-day decay predictions

## 🔮 ML Model Details

- **Algorithm:** Gradient Boosting (XGBoost)
- **Features:** Altitude, inclination, eccentricity, mass, area, solar flux, geomagnetic indices
- **Training:** 5-fold cross-validation, GridSearchCV hyperparameter tuning
- **Models:** General hybrid, Starlink-specific, robust variants
- **Validation:** RMSE 12.3 days (7-day), 45.8 days (90-day)

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- Space-Track.org (US Space Force)
- N2YO.com
- NOAA Space Weather Prediction Center
- satellite.js community

---

**Built with 🚀 by Arnab Mukherjee**
