"""
Space-Track.org API Client
Simple Python wrapper for fetching TLE data
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import time
from datetime import datetime, timedelta
import json


class SpaceTrackClient:
    """
    Client for Space-Track.org API
    Uses persistent cookie jar for authentication
    Includes caching to avoid rate limits
    """
    
    BASE_URL = "https://www.space-track.org"
    
    def __init__(self, username, password):
        self.username = username
        self.password = password
        # Create session with cookie jar
        self.session = requests.Session()
        # Configure retries
        retry = Retry(total=3, backoff_factor=0.3)
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount('https://', adapter)
        self.session.mount('http://', adapter)
        # TLE cache to avoid rate limits
        self._tle_cache = {}
        self._cache_duration = 300  # 5 minutes
        # Authenticate on init
        self.authenticate()
        
    def authenticate(self):
        """Login and establish session with cookies"""
        # Authenticate using form data
        credentials = {
            'identity': self.username,
            'password': self.password
        }
        
        # Post to login endpoint
        resp = self.session.post(
            f"{self.BASE_URL}/ajaxauth/login",
            data=credentials,
            headers={'User-Agent': 'SpaceTrackClient/1.0'}
        )
        
        if resp.status_code != 200:
            print(f"❌ Authentication failed: {resp.status_code}")
            print(f"   Response: {resp.text[:200]}")
            return False
        
        # Check if we have cookies
        if len(self.session.cookies) == 0:
            print(f"❌ No cookies received after authentication")
            return False
            
        print(f"✅ Authenticated with Space-Track.org")
        return True
    
    def get_tle_history(self, norad_id, days_back=120):
        """
        Fetch historical TLE data for a satellite
        
        Args:
            norad_id: NORAD catalog ID (e.g., 25544 for ISS)
            days_back: Number of days of history to fetch
            
        Returns:
            List of TLE records with epoch, altitude, etc.
        """
        # Build query for gp_history class
        query = (
            f"/basicspacedata/query/class/gp_history/"
            f"NORAD_CAT_ID/{norad_id}/"
            f"orderby/EPOCH%20desc/"
            f"EPOCH/%3Enow-{days_back}/"  # >now-X URL-encoded
            f"format/json"
        )
        
        print(f"🛰️  Fetching TLE history for NORAD {norad_id} (past {days_back} days)...")
        
        try:
            response = self.session.get(self.BASE_URL + query)
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Received {len(data)} TLE records")
                
                # Parse and enrich data
                parsed = []
                for tle in data:
                    parsed.append({
                        'epoch': tle['EPOCH'],
                        'norad_id': tle['NORAD_CAT_ID'],
                        'object_name': tle['OBJECT_NAME'],
                        'mean_motion': float(tle['MEAN_MOTION']),
                        'eccentricity': float(tle['ECCENTRICITY']),
                        'inclination': float(tle['INCLINATION']),
                        'altitude': self._calculate_altitude(float(tle['MEAN_MOTION'])),
                        'tle_line1': tle['TLE_LINE1'],
                        'tle_line2': tle['TLE_LINE2']
                    })
                
                return parsed
            else:
                print(f"❌ Request failed: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return []
                
        except Exception as e:
            print(f"❌ Error fetching TLE history: {e}")
            return []
    
    @staticmethod
    def _calculate_altitude(mean_motion):
        """
        Calculate altitude from mean motion (revolutions per day)
        Using Kepler's third law
        """
        earth_radius = 6371.0  # km
        GM = 398600.4418  # Earth's gravitational parameter (km³/s²)
        
        # Period in seconds
        period = (24 * 3600) / mean_motion
        
        # Semi-major axis from Kepler's third law
        a = (GM * period**2 / (4 * 3.14159265**2)) ** (1/3)
        
        # Altitude = semi-major axis - Earth radius
        altitude = a - earth_radius
        
        return round(altitude, 2)
    
    def get_current_tle(self, norad_id):
        """Get the most recent TLE for a satellite (with caching)"""
        # Check cache first
        if norad_id in self._tle_cache:
            cached_data, cached_time = self._tle_cache[norad_id]
            age = (datetime.now() - cached_time).total_seconds()
            if age < self._cache_duration:
                print(f"💾 Using cached TLE for NORAD {norad_id} (age: {int(age)}s)")
                return cached_data
        
        query = (
            f"/basicspacedata/query/class/gp/"
            f"NORAD_CAT_ID/{norad_id}/"
            f"orderby/EPOCH%20desc/"
            f"limit/1/"
            f"format/json"
        )
        
        try:
            response = self.session.get(self.BASE_URL + query)
            if response.status_code == 200:
                data = response.json()
                if len(data) > 0:
                    tle = data[0]
                    
                    # Check if response contains error
                    if 'error' in tle:
                        print(f"❌ Space-Track returned error: {tle.get('error')}")
                        return None
                    
                    # Check if satellite has decayed (no EPOCH means no current TLE)
                    if 'EPOCH' not in tle:
                        print(f"⚠️  Satellite {norad_id} may have decayed (no EPOCH in TLE)")
                        # Cache negative result to avoid repeated queries
                        self._tle_cache[norad_id] = (None, datetime.now())
                        return None
                    
                    result = {
                        'epoch': tle['EPOCH'],
                        'norad_id': tle['NORAD_CAT_ID'],
                        'object_name': tle['OBJECT_NAME'],
                        'mean_motion': float(tle['MEAN_MOTION']),
                        'eccentricity': float(tle['ECCENTRICITY']),
                        'inclination': float(tle['INCLINATION']),
                        'altitude_km': self._calculate_altitude(float(tle['MEAN_MOTION'])),
                        'tle_line1': tle['TLE_LINE1'],
                        'tle_line2': tle['TLE_LINE2']
                    }
                    
                    # Cache the result
                    self._tle_cache[norad_id] = (result, datetime.now())
                    return result
                else:
                    print(f"❌ No TLE data returned for NORAD {norad_id}")
                    # Cache negative result
                    self._tle_cache[norad_id] = (None, datetime.now())
                    return None
            else:
                print(f"❌ Request failed: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
            return None
        except Exception as e:
            print(f"❌ Error fetching current TLE: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def get_decay_data(self, days_back=30):
        """
        Get recent satellite decay/reentry data
        Returns satellites that have decayed in the past N days
        
        Args:
            days_back: Number of days to look back
            
        Returns:
            List of decay records with NORAD_ID, name, decay date, etc.
        """
        from datetime import datetime, timedelta
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        # Format dates for API (YYYY-MM-DD)
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        query = (
            f"/basicspacedata/query/class/decay/"
            f"DECAY_EPOCH/%3Enow-{days_back}/"
            f"orderby/DECAY_EPOCH%20desc/"
            f"format/json"
        )
        
        try:
            response = self.session.get(self.BASE_URL + query)
            if response.status_code == 200:
                data = response.json()
                
                if len(data) == 0:
                    print("⚠️  No decay data in response")
                    return []
                
                # Debug: print first item to see structure
                if data:
                    print(f"📝 Sample decay record fields: {list(data[0].keys())[:10]}")
                
                decays = []
                for item in data:
                    decays.append({
                        'norad_id': item.get('NORAD_CAT_ID', item.get('NORAD_ID')),
                        'name': item.get('OBJECT_NAME', item.get('SATNAME', 'UNKNOWN')),
                        'intldes': item.get('INTLDES', item.get('OBJECT_ID')),
                        'decay_date': item.get('DECAY', item.get('DECAY_EPOCH')),
                        'msg_epoch': item.get('MSG_EPOCH'),
                        'rcs_size': item.get('RCS'),  # SMALL, MEDIUM, LARGE
                        'country': item.get('COUNTRY'),
                        'msg_type': item.get('TYPE')  # Prediction or Historical
                    })
                
                return decays
            else:
                print(f"❌ Request failed: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return []
        except Exception as e:
            print(f"❌ Error fetching decay data: {e}")
            import traceback
            traceback.print_exc()
            return []


# Simple test function
if __name__ == "__main__":
    # Test with ISS
    import os
    
    username = os.getenv('SPACETRACK_USERNAME', 'your_username')
    password = os.getenv('SPACETRACK_PASSWORD', 'your_password')
    
    if username == 'your_username':
        print("⚠️  Set SPACETRACK_USERNAME and SPACETRACK_PASSWORD environment variables")
        exit(1)
    
    client = SpaceTrackClient(username, password)
    
    # Fetch ISS history
    iss_data = client.get_tle_history(25544, days_back=120)
    
    if iss_data:
        print(f"\n📊 ISS Data Summary:")
        print(f"   Records: {len(iss_data)}")
        print(f"   Date range: {iss_data[-1]['epoch']} to {iss_data[0]['epoch']}")
        print(f"   Current altitude: {iss_data[0]['altitude']} km")
        
        print(f"\n📈 Recent altitude points:")
        for i, point in enumerate(iss_data[:5]):
            print(f"   {point['epoch']}: {point['altitude']} km")
