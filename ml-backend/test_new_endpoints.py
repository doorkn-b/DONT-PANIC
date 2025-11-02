from noaa_client import NOAAClient

print("🧪 TESTING NEW NOAA ENDPOINTS\n")

client = NOAAClient()

# Test 27-day forecast
print("=" * 60)
print("📅 27-DAY FORECAST (F10.7, A-index, Kp)")
print("=" * 60)
forecast = client.get_27day_forecast()
if forecast:
    print(f"✅ Retrieved {len(forecast)} days of forecast")
    print(f"\nFirst 5 days:")
    for day in forecast[:5]:
        print(f"  {day['date']}: F10.7={day['f10.7']}, Kp={day['kp']}, A={day['a_index']}")
    print(f"\nLast 5 days:")
    for day in forecast[-5:]:
        print(f"  {day['date']}: F10.7={day['f10.7']}, Kp={day['kp']}, A={day['a_index']}")
else:
    print("❌ Failed to fetch 27-day forecast")

# Test 3-day geomag forecast
print("\n" + "=" * 60)
print("🌍 3-DAY GEOMAGNETIC FORECAST")
print("=" * 60)
geomag = client.get_3day_geomag_forecast()
if geomag:
    print("✅ Retrieved 3-day geomag forecast")
    print(f"Timestamp: {geomag['timestamp']}")
    print("\nForecast excerpt:")
    lines = geomag['forecast_text'].split('\n')[:20]
    for line in lines:
        if line.strip():
            print(f"  {line}")
else:
    print("❌ Failed to fetch 3-day geomag forecast")

# Test X-ray flux
print("\n" + "=" * 60)
print("☀️ CURRENT X-RAY FLUX (Solar Flares)")
print("=" * 60)
xray = client.get_xray_flux()
if xray:
    print("✅ Retrieved X-ray flux")
    print(f"  Timestamp: {xray['timestamp']}")
    print(f"  Flare Class: {xray['flare_class']}")
    print(f"  Flux: {xray['flux']:.2e} W/m²")
    print(f"  Satellite: {xray['satellite']}")
else:
    print("❌ Failed to fetch X-ray flux")

print("\n" + "=" * 60)
print("✅ ALL NEW ENDPOINT TESTS COMPLETE")
print("=" * 60)
