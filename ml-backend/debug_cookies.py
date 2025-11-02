import requests
import os
from urllib.parse import quote

username = os.getenv('SPACETRACK_USERNAME')
password = os.getenv('SPACETRACK_PASSWORD')

print("Testing Space-Track cookie handling...\n")
print(f"Username: '{username}'")
print(f"Username length: {len(username)}")
print(f"Password length: {len(password)}")
print(f"Password first 3 chars: {password[:3]}")
print(f"Password last 3 chars: {password[-3:]}")
print(f"Password has special chars: {any(c in password for c in ['*', '-', '_'])}\n")

if not username or not password:
    print("❌ ERROR: Credentials not set!")
    exit(1)

# Method 1: Try with explicit cookies parameter
session = requests.Session()

print("Step 1a: Try with full email")
login_data = {'identity': username, 'password': password}
print(f"  identity={username}")
login_resp = session.post('https://www.space-track.org/ajaxauth/login', data=login_data)
print(f"  Status: {login_resp.status_code}, Response: '{login_resp.text}'")

print("\nStep 1b: Try with just username part")
username_only = username.split('@')[0]
login_data2 = {'identity': username_only, 'password': password}
print(f"  identity={username_only}")
session2 = requests.Session()
login_resp2 = session2.post('https://www.space-track.org/ajaxauth/login', data=login_data2)
print(f"  Status: {login_resp2.status_code}, Response: '{login_resp2.text}'")

# Use whichever worked
if login_resp2.text != '{"Login":"Failed"}':
    session = session2
    print("  ✅ Login with username succeeded!")
elif login_resp.text != '{"Login":"Failed"}':
    print("  ✅ Login with email succeeded!")
else:
    print("  ❌ Both login attempts failed")
    
print(f"\nCookies: {dict(session.cookies)}")

print("\nStep 2: Try simpler endpoint first")
simple_url = 'https://www.space-track.org/basicspacedata/query/class/boxscore/format/json'
simple_resp = session.get(simple_url)
print(f"  Status: {simple_resp.status_code}")
if simple_resp.status_code == 200:
    print(f"  Success! Got {len(simple_resp.text)} bytes")
else:
    print(f"  Failed: {simple_resp.text[:200]}")

print("\nStep 3: Try ISS TLE")
api_url = 'https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/25544/limit/1/format/json'
api_resp = session.get(api_url)
print(f"  Status: {api_resp.status_code}")
if api_resp.status_code == 200:
    print(f"  Success! Got data")
else:
    print(f"  Failed: {api_resp.text[:200]}")
