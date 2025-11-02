from noaa_client import NOAAClient
import json

client = NOAAClient()
data = client.get_solar_wind_24hour()

print(f"Length: {len(data)}")
print("\nFirst 5 items:")
print(json.dumps(data[:5], indent=2))
print("\nLast item:")
print(json.dumps(data[-1], indent=2))
