import requests

# Test solar wind API
r = requests.get('https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json')
data = r.json()

print(f"Status: {r.status_code}")
print(f"Type: {type(data)}")
print(f"Length: {len(data)}")
print("\nFirst 3 items:")
for i in range(min(5, len(data))):
    print(f"{i}: {data[i]}")
    print(f"   Type: {type(data[i])}")
