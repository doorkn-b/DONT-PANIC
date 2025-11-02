# OrbitShield Backend Proxy

This backend server acts as a proxy to the N2YO satellite tracking API, bypassing CORS restrictions.

## Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3001`

## Endpoints

- `GET /api/satellites` - Fetches real-time satellite data from N2YO API
- `GET /api/health` - Health check endpoint

## How It Works

The frontend makes requests to `http://localhost:3001/api/satellites` instead of directly to N2YO. The backend:
1. Receives the request from your frontend
2. Makes the actual API call to N2YO (no CORS issue since it's server-to-server)
3. Returns the data to your frontend

## API Key

The N2YO API key is configured in `server.js`: `2DG2C5-XDWT8L-HHFGUQ-5LH2`

## Rate Limiting

The server includes delays between TLE requests to avoid rate limiting (100ms per satellite).

## Fallback

If the backend is not running, the frontend will automatically fall back to demo satellites.
