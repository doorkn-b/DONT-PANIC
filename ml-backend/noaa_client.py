"""
NOAA Space Weather Prediction Center (SWPC) Data Client
Fetches real-time and historical space weather data for orbital decay modeling

Real-time endpoints (no authentication required):
- F10.7 solar flux: Primary driver of thermospheric density
- Kp index: Geomagnetic activity causing density spikes
- Solar wind: Real-time conditions for short-term predictions
- Geomagnetic storms: Current storm levels
"""

import requests
from datetime import datetime, timedelta
import math


class NOAAClient:
    """Client for NOAA SWPC API - Real-time space weather data"""
    
    BASE_URL = "https://services.swpc.noaa.gov"
    
    def get_current_solar_flux(self):
        """
        Get current F10.7 solar flux (10.7 cm radio flux)
        Primary driver of thermospheric density
        
        IMPORTANT: F10.7 is GLOBAL, not region-based
        - Measured from Penticton, Canada (single ground station)
        - One value for entire Earth
        - Updates daily at ~17:00 UTC
        
        Returns:
            dict: {timestamp, f107, source, age_hours, is_stale} or None if failed
        """
        url = f"{self.BASE_URL}/json/f107_cm_flux.json"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                
                # Get most recent measurement
                if len(data) > 0:
                    latest = data[-1]
                    f107 = float(latest['flux'])
                    timestamp = latest['time_tag']
                    
                    # Validate F10.7 value
                    if not (50 < f107 < 400):
                        print(f"⚠️  Suspicious F10.7 value: {f107} sfu (normal: 70-300)")
                    
                    # Check data age
                    data_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    age_hours = (datetime.now(data_time.tzinfo) - data_time).total_seconds() / 3600
                    is_stale = age_hours > 48  # Flag if > 2 days old
                    
                    
                    return {
                        'timestamp': timestamp,
                        'f107': f107,
                        'source': 'NOAA_SWPC',
                        'status': 'success',
                        'age_hours': round(age_hours, 1),
                        'is_stale': is_stale
                    }
            return None
        except Exception as e:
            print(f"⚠️  Error fetching solar flux: {e}")
            return None
    
    def get_kp_index(self):
        """
        Get current Kp geomagnetic index (0-9 scale)
        Indicates geomagnetic storm activity causing density spikes
        
        IMPORTANT: Kp is GLOBAL average, but effects are regional
        - Measured from 13 ground stations worldwide
        - Storm effects strongest at high latitudes (auroral zones)
        - Updates every 3 hours
        
        Returns:
            dict: {timestamp, kp, g_scale, source} or None if failed
        """
        url = f"{self.BASE_URL}/json/planetary_k_index_1m.json"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if len(data) > 0:
                    latest = data[-1]
                    kp = float(latest['kp_index'])
                    
                    # Validate Kp value
                    if not (0 <= kp <= 9):
                        print(f"⚠️  Invalid Kp value: {kp} (must be 0-9)")
                        kp = max(0, min(9, kp))  # Clamp to valid range
                    
                    # Calculate G-scale from Kp
                    if kp < 5:
                        g_scale = 'G0'
                        storm_level = 'No storm'
                    elif kp < 6:
                        g_scale = 'G1'
                        storm_level = 'Minor storm'
                    elif kp < 7:
                        g_scale = 'G2'
                        storm_level = 'Moderate storm'
                    elif kp < 8:
                        g_scale = 'G3'
                        storm_level = 'Strong storm'
                    elif kp < 9:
                        g_scale = 'G4'
                        storm_level = 'Severe storm'
                    else:
                        g_scale = 'G5'
                        storm_level = 'Extreme storm'
                    
                    return {
                        'timestamp': latest['time_tag'],
                        'kp': kp,
                        'g_scale': g_scale,
                        'storm_level': storm_level,
                        'source': 'NOAA_SWPC',
                        'status': 'success'
                    }
            return None
        except Exception as e:
            print(f"⚠️  Error fetching Kp index: {e}")
            return None
    
    # DEPRECATED: Storm level endpoint unreliable
    # G-scale is now calculated directly from Kp index in get_kp_index() method
    # No longer needed - removed for reliability
    
    def get_27day_forecast(self):
        """
        Get 27-day forecast of F10.7, A-index, and Kp
        Updated Mondays by 1500 UTC
        
        Returns:
            list: Daily forecasts for next 27 days with f10.7, a_index, kp
        """
        url = f"{self.BASE_URL}/text/27-day-outlook.txt"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                lines = response.text.split('\n')
                forecasts = []
                
                for line in lines:
                    # Skip headers and empty lines
                    if not line.strip() or line.startswith('#') or line.startswith(':') or 'UTC' in line or 'Date' in line:
                        continue
                    
                    # Parse data lines: "2025 Nov 02     130           5          2"
                    parts = line.split()
                    if len(parts) >= 5 and parts[0].isdigit():
                        try:
                            year = int(parts[0])
                            month = parts[1]
                            day = int(parts[2])
                            f107 = float(parts[3])
                            a_index = float(parts[4])
                            kp = float(parts[5])
                            
                            # Convert month name to number
                            month_num = datetime.strptime(month, '%b').month
                            date_str = f"{year}-{month_num:02d}-{day:02d}"
                            
                            forecasts.append({
                                'date': date_str,
                                'f10.7': f107,
                                'a_index': a_index,
                                'kp': kp,
                                'source': 'NOAA_27day_outlook'
                            })
                        except (ValueError, IndexError):
                            continue
                
                if len(forecasts) > 0:
                    print(f"✅ Retrieved {len(forecasts)} days of forecast data")
                    return forecasts
            
            return None
        except Exception as e:
            print(f"⚠️  Error fetching 27-day forecast: {e}")
            return None
    
    def get_3day_geomag_forecast(self):
        """
        Get 3-day geomagnetic activity forecast
        Predicts Kp indices for next 3 days
        
        Returns:
            dict: Forecast for next 3 days with predicted Kp ranges
        """
        url = f"{self.BASE_URL}/text/3-day-geomag-forecast.txt"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                # Parse the text forecast
                # Format varies, but typically shows Kp predictions by day
                text = response.text
                return {
                    'forecast_text': text,
                    'source': 'NOAA_3day_geomag',
                    'timestamp': datetime.now().isoformat()
                }
            return None
        except Exception as e:
            print(f"⚠️  Error fetching 3-day geomag forecast: {e}")
            return None
    
    def get_xray_flux(self):
        """
        Get current GOES X-ray flux (solar flare indicator)
        Flares cause immediate ionospheric heating and density spikes
        
        Returns:
            dict: Latest X-ray measurements from GOES satellites
        """
        url = f"{self.BASE_URL}/json/goes/primary/xrays-6-hour.json"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if len(data) > 0:
                    latest = data[-1]
                    
                    # Parse flux values (in Watts/m²)
                    flux_long = float(latest.get('flux', 0))  # 0.1-0.8nm (primary for flare class)
                    
                    # Determine flare class
                    if flux_long < 1e-8:
                        flare_class = 'A' + str(int(flux_long / 1e-8))[:1]
                    elif flux_long < 1e-7:
                        flare_class = 'B' + str(int(flux_long / 1e-8))[:1]
                    elif flux_long < 1e-6:
                        flare_class = 'C' + str(int(flux_long / 1e-7))[:1]
                    elif flux_long < 1e-5:
                        flare_class = 'M' + str(int(flux_long / 1e-6))[:1]
                    elif flux_long < 1e-4:
                        flare_class = 'X' + str(int(flux_long / 1e-5))[:1]
                    else:
                        flare_class = 'X10+'
                    
                    return {
                        'timestamp': latest['time_tag'],
                        'flux': flux_long,
                        'flare_class': flare_class,
                        'satellite': latest.get('satellite', 'GOES'),
                        'source': 'NOAA_GOES_XRS'
                    }
            return None
        except Exception as e:
            print(f"⚠️  Error fetching X-ray flux: {e}")
            return None
    
    def get_xray_flux_6hour(self):
        """
        Get 6 hours of GOES X-ray flux data for graphing
        Returns full time series for real-time visualization
        
        Returns:
            list: X-ray flux measurements for past 6 hours
        """
        url = f"{self.BASE_URL}/json/goes/primary/xrays-6-hour.json"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return [{
                    'time': entry['time_tag'],
                    'flux': float(entry.get('flux', 0)),
                    'satellite': entry.get('satellite', 'GOES')
                } for entry in data]
            return []
        except Exception as e:
            print(f"⚠️  Error fetching X-ray flux history: {e}")
            return []
    
    def get_solar_wind(self):
        """
        Get real-time solar wind data from ACE/DSCOVR satellites
        Provides speed, density, and magnetic field measurements
        
        Returns:
            dict: Latest solar wind parameters
        """
        plasma_url = f"{self.BASE_URL}/products/solar-wind/plasma-1-day.json"
        mag_url = f"{self.BASE_URL}/products/solar-wind/mag-1-day.json"
        
        try:
            # Get plasma data (speed, density)
            plasma_response = requests.get(plasma_url, timeout=10)
            mag_response = requests.get(mag_url, timeout=10)
            
            if plasma_response.status_code == 200 and mag_response.status_code == 200:
                plasma_data = plasma_response.json()
                mag_data = mag_response.json()
                
                # Data format: first row is headers, subsequent rows are values
                # Plasma: ['time_tag', 'density', 'speed', 'temperature']
                # Mag: ['time_tag', 'bx_gsm', 'by_gsm', 'bz_gsm', 'lon_gsm', 'lat_gsm', 'bt']
                
                if isinstance(plasma_data, list) and len(plasma_data) > 1:
                    latest_plasma = plasma_data[-1]  # Last data row
                    latest_mag = mag_data[-1] if len(mag_data) > 1 else None
                    
                    return {
                        'timestamp': latest_plasma[0],  # time_tag
                        'density': float(latest_plasma[1]),  # particles/cm³
                        'speed': float(latest_plasma[2]),  # km/s
                        'temperature': float(latest_plasma[3]),  # K
                        'bt': float(latest_mag[6]) if latest_mag else 0,  # Total magnetic field (nT)
                        'bz': float(latest_mag[3]) if latest_mag else 0,  # Z-component (nT)
                        'source': 'NOAA_SWPC_ACE_DSCOVR'
                    }
            return None
        except Exception as e:
            print(f"⚠️  Error fetching solar wind: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def get_solar_wind_24hour(self):
        """
        Get 24 hours of solar wind data for graphing
        
        Returns:
            list: Solar wind measurements for past 24 hours
        """
        plasma_url = f"{self.BASE_URL}/products/solar-wind/plasma-1-day.json"
        mag_url = f"{self.BASE_URL}/products/solar-wind/mag-1-day.json"
        
        try:
            plasma_response = requests.get(plasma_url, timeout=10)
            mag_response = requests.get(mag_url, timeout=10)
            
            if plasma_response.status_code == 200 and mag_response.status_code == 200:
                plasma_data = plasma_response.json()
                mag_data = mag_response.json()
                
                # Skip header row (index 0)
                # Plasma: ['time_tag', 'density', 'speed', 'temperature']
                # Mag: ['time_tag', 'bx_gsm', 'by_gsm', 'bz_gsm', 'lon_gsm', 'lat_gsm', 'bt']
                
                if isinstance(plasma_data, list) and len(plasma_data) > 1:
                    # Create dict lookup for mag data by timestamp
                    mag_dict = {}
                    if isinstance(mag_data, list) and len(mag_data) > 1:
                        for row in mag_data[1:]:  # Skip header
                            try:
                                if row[6] is not None and row[3] is not None:
                                    mag_dict[row[0]] = {'bt': float(row[6]), 'bz': float(row[3])}
                            except (ValueError, IndexError):
                                continue
                    
                    result = []
                    for row in plasma_data[1:]:  # Skip header
                        try:
                            # Skip rows with None values
                            if row[2] is None or row[1] is None:
                                continue
                                
                            timestamp = row[0]
                            mag_info = mag_dict.get(timestamp, {'bt': 0, 'bz': 0})
                            
                            result.append({
                                'time': timestamp,
                                'speed': float(row[2]),
                                'density': float(row[1]),
                                'bt': mag_info['bt'],
                                'bz': mag_info['bz']
                            })
                        except (ValueError, IndexError, TypeError):
                            continue
                    
                    return result
            return []
        except Exception as e:
            print(f"⚠️  Error fetching solar wind history: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_planetary_k_index_24hour(self):
        """
        Get 24 hours of planetary K-index for graphing
        
        Returns:
            list: K-index measurements for past 24 hours
        """
        url = f"{self.BASE_URL}/json/planetary_k_index_1m.json"
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return [{
                    'time': entry.get('time_tag'),
                    'kp': float(entry.get('kp_index', 0))
                } for entry in data]
            return []
        except Exception as e:
            print(f"⚠️  Error fetching K-index history: {e}")
            return []
    
    def get_historical_solar_flux(self, start_date, end_date):
        """
        Get historical F10.7 solar flux for date range
        Uses SWPC observed solar cycle indices (monthly averages from 1947-present)
        
        Args:
            start_date: datetime object or ISO string
            end_date: datetime object or ISO string
            
        Returns:
            List of daily F10.7 values (interpolated from monthly)
        """
        # Convert to datetime if strings
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        
        print(f"📅 Fetching historical F10.7 from {start_date.date()} to {end_date.date()}...")
        
        # Get monthly observed solar cycle indices from SWPC (note: hyphenated URL)
        url = f"{self.BASE_URL}/json/solar-cycle/observed-solar-cycle-indices.json"
        
        try:
            response = requests.get(url, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                
                # Parse monthly F10.7 values - try multiple field name variations
                monthly_f107 = {}
                for entry in data:
                    try:
                        # Try different date field names
                        date_str = entry.get('time-tag') or entry.get('time_tag') or entry.get('date')
                        if not date_str:
                            continue
                            
                        # Parse YYYY-MM or YYYY-MM-DD format
                        try:
                            entry_date = datetime.strptime(date_str, '%Y-%m')
                        except ValueError:
                            entry_date = datetime.strptime(date_str[:7], '%Y-%m')
                        
                        # Try different F10.7 field names
                        f107_value = (entry.get('f10.7') or 
                                     entry.get('f107') or 
                                     entry.get('F10.7') or 
                                     entry.get('observed_flux') or 0)
                        f107_value = float(f107_value)
                        
                        if f107_value > 0:  # Skip missing data
                            monthly_f107[entry_date.strftime('%Y-%m')] = f107_value
                    except (ValueError, KeyError, TypeError) as e:
                        continue
                
                if len(monthly_f107) == 0:
                    print("⚠️  No valid F10.7 data in response")
                    return self._estimate_historical_flux(start_date, end_date)
                
                print(f"✅ Retrieved {len(monthly_f107)} months of F10.7 data from SWPC")
                
                # Interpolate to daily values
                daily_data = []
                current = start_date
                
                while current <= end_date:
                    month_key = current.strftime('%Y-%m')
                    
                    # Use monthly value for all days in that month
                    f107 = monthly_f107.get(month_key, 120.0)  # Default to quiet sun
                    
                    daily_data.append({
                        'date': current.isoformat(),
                        'f107': f107
                    })
                    
                    current += timedelta(days=1)
                
                print(f"✅ Generated {len(daily_data)} daily F10.7 values")
                return daily_data
                    
        except Exception as e:
            print(f"⚠️  Error fetching SWPC data: {type(e).__name__}: {e}")
        
        # Fallback: estimate using sinusoidal model
        print("⚠️  Using estimated solar flux (fallback)")
        return self._estimate_historical_flux(start_date, end_date)
    
    @staticmethod
    def _estimate_solar_flux():
        """Estimate current solar flux using 27-day cycle"""
        day_of_year = datetime.now().timetuple().tm_yday
        cycle_position = (day_of_year % 27) / 27.0
        
        # Solar cycle between 90-180 sfu (typical)
        base = 120.0
        amplitude = 30.0
        f107 = base + amplitude * math.sin(2 * math.pi * cycle_position)
        
        return {
            'timestamp': datetime.now().isoformat(),
            'f107': round(f107, 1),
            'source': 'estimated'
        }
    
    @staticmethod
    def _estimate_historical_flux(start_date, end_date):
        """Generate estimated historical solar flux"""
        data = []
        current = start_date
        
        while current <= end_date:
            day_of_year = current.timetuple().tm_yday
            cycle_position = (day_of_year % 27) / 27.0
            
            base = 120.0
            amplitude = 30.0
            f107 = base + amplitude * math.sin(2 * math.pi * cycle_position)
            
            data.append({
                'date': current.isoformat(),
                'f107': round(f107, 1)
            })
            
            current += timedelta(days=1)
        
        return data
    
    @staticmethod
    def calculate_density_multiplier(f107):
        """
        Calculate atmospheric density multiplier from F10.7
        Based on empirical atmospheric density models
        """
        # Baseline at F10.7 = 120 sfu
        multiplier = 1.0 + ((f107 - 120.0) / 300.0)
        
        # Clamp to reasonable range
        return max(0.8, min(1.5, multiplier))
    
    def get_solar_weather_data(self):
        """Get comprehensive current solar weather"""
        flux_data = self.get_current_solar_flux()
        kp_data = self.get_kp_index()
        
        f107 = flux_data['f107'] if flux_data else 120.0
        kp = kp_data['kp'] if kp_data else 3.0
        
        density_mult = self.calculate_density_multiplier(f107)
        drag_increase = (density_mult - 1.0) * 100
        
        # Activity level
        if f107 < 100:
            activity = "Very Low"
        elif f107 < 120:
            activity = "Low"
        elif f107 < 150:
            activity = "Moderate"
        elif f107 < 180:
            activity = "High"
        elif f107 < 220:
            activity = "Very High"
        else:
            activity = "Extreme"
        
        return {
            'timestamp': datetime.now().isoformat(),
            'solar_flux': f107,
            'kp_index': kp,
            'activity_level': activity,
            'density_multiplier': round(density_mult, 3),
            'drag_increase_percent': round(drag_increase, 1),
            'source': flux_data['source'] if flux_data else 'estimated'
        }


# Test function
if __name__ == "__main__":
    client = NOAAClient()
    
    # Test current data
    print("☀️  Testing NOAA API...")
    current = client.get_solar_weather_data()
    print(f"\n📊 Current Solar Weather:")
    print(f"   F10.7: {current['solar_flux']} sfu")
    print(f"   Kp: {current['kp_index']}")
    print(f"   Activity: {current['activity_level']}")
    print(f"   Density multiplier: {current['density_multiplier']}x")
    print(f"   Drag increase: +{current['drag_increase_percent']}%")
    print(f"   Source: {current['source']}")
    
    # Test historical data
    print(f"\n📅 Testing historical solar flux (past 30 days)...")
    end = datetime.now()
    start = end - timedelta(days=30)
    historical = client.get_historical_solar_flux(start, end)
    print(f"   Retrieved {len(historical)} data points")
    if historical:
        print(f"   Range: {historical[0]['f107']:.1f} - {historical[-1]['f107']:.1f} sfu")
