import requests

print("=== TESTING SOLAR CYCLE ENDPOINTS ===\n")

# Test observed
r1 = requests.get('https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json')
print(f"OBSERVED Status: {r1.status_code}")
print(f"Total records: {len(r1.json())}")
print(f"Keys: {list(r1.json()[0].keys())}")
print("\nLast 3 months (most recent):")
for record in r1.json()[-3:]:
    print(f"  {record['time-tag']}: F10.7={record['f10.7']}, SSN={record['ssn']}")

# Test predicted
r2 = requests.get('https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json')
print(f"\nPREDICTED Status: {r2.status_code}")
print(f"Total records: {len(r2.json())}")
print(f"Keys: {list(r2.json()[0].keys())}")
print("\nFirst 3 months:")
for record in r2.json()[:3]:
    print(f"  {record['time-tag']}: F10.7={record['predicted_f10.7']}, SSN={record['predicted_ssn']}")
