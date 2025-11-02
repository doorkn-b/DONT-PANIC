import React, { useRef, useMemo, Suspense, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { fetchSatelliteTLEs, getSatellitePosition, latLonAltToCartesian } from '../services/satelliteTracker';
import './Earth3D.css';

// Vertex Shader for Earth
const earthVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;
    
    vec3 modelNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
    
    vUv = uv;
    vNormal = modelNormal;
    vPosition = modelPosition.xyz;
}
`;

// Fragment Shader for Earth
const earthFragmentShader = `
uniform sampler2D uDayTexture;
uniform sampler2D uNightTexture;
uniform sampler2D uSpecularCloudsTexture;
uniform vec3 uSunDirection;
uniform vec3 uAtmosphereDayColor;
uniform vec3 uAtmosphereTwilightColor;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);
    vec3 color = vec3(0.0);

    // Sun orientation
    float sunOrientation = dot(uSunDirection, normal);

    // Day / night color
    float dayMix = smoothstep(-0.25, 0.5, sunOrientation);
    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;
    nightColor *= 2.5;  // Brighten night side - change this number (1.5 - 3.0)
    color = mix(nightColor, dayColor, dayMix);

    // Specular cloud color
    vec2 specularCloudColor = texture2D(uSpecularCloudsTexture, vUv).rg;

    // Clouds
    float cloudsMix = smoothstep(0.5, 1.0, specularCloudColor.g);
    cloudsMix *= dayMix;
    color = mix(color, vec3(1.0), cloudsMix);

    // Fresnel
    float fresnel = dot(viewDirection, normal) + 1.0;
    fresnel = pow(fresnel, 2.0);

    // Atmosphere
    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    color = mix(color, atmosphereColor, fresnel * atmosphereDayMix);

    // Specular
    vec3 reflection = reflect(-uSunDirection, normal);
    float specular = -dot(reflection, viewDirection);
    specular = max(specular, 0.0);
    specular = pow(specular, 32.0);
    specular *= specularCloudColor.r;

    vec3 specularColor = mix(vec3(1.0), atmosphereColor, fresnel);
    color += specular * specularColor;

    gl_FragColor = vec4(color, 1.0);
}
`;

// Vertex Shader for Atmosphere
const atmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;
    
    vec3 modelNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
    
    vNormal = modelNormal;
    vPosition = modelPosition.xyz;
}
`;

// Fragment Shader for Atmosphere
const atmosphereFragmentShader = `
uniform vec3 uSunDirection;
uniform vec3 uAtmosphereDayColor;
uniform vec3 uAtmosphereTwilightColor;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);
    vec3 color = vec3(0.0);

    // Sun orientation
    float sunOrientation = dot(uSunDirection, normal);

    // Atmosphere
    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    color += atmosphereColor;

    // Alpha
    float edgeAlpha = dot(viewDirection, normal);
    edgeAlpha = smoothstep(0.0, 0.5, edgeAlpha);

    float dayAlpha = smoothstep(-0.5, 0.0, sunOrientation);

    float alpha = edgeAlpha * dayAlpha;

    gl_FragColor = vec4(color, alpha);
}
`;

// Earth parameters
const earthParameters = {
  atmosphereDayColor: '#00aaff',
  atmosphereTwilightColor: '#0088ff',
  sunPhi: Math.PI * 0.5,
  sunTheta: Math.PI + 0.5,  // Set to opposite side for full night
  ambientIntensity: 0.6
    // Increased brightness for better visibility
};

// Sun direction
const sunSpherical = new THREE.Spherical(1, earthParameters.sunPhi, earthParameters.sunTheta);
const sunDirection = new THREE.Vector3();

function updateSunDirection() {
  // Calculate sun position based on real UTC time
  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  
  // Calculate decimal hours (0-24)
  const hoursDecimal = hours + minutes / 60 + seconds / 3600;
  
  // Sun position calculation:
  // At 12:00 UTC → sun illuminates 0° longitude (Greenwich, solar noon)
  // Sun moves 15° per hour westward (360° / 24 hours)
  // Formula: sun longitude = (12 - T) * 15° where T is UTC hours
  const sunLongitude = (12 - hoursDecimal) * 15;
  
  // Convert longitude to radians for Three.js
  // In our Earth texture coordinate system:
  // - Longitude 0° (Greenwich) is at the front (positive Z)
  // - Longitude 90°E is to the right (positive X)
  // - Longitude 90°W is to the left (negative X)
  const lonRad = sunLongitude * Math.PI / 180;
  
  // Create sun direction vector pointing from Earth center toward the sun
  // Sun is at the equator (y = 0), rotating around Y-axis by longitude
  sunDirection.x = Math.sin(lonRad);
  sunDirection.y = 0;
  sunDirection.z = Math.cos(lonRad);
  sunDirection.normalize();
}

updateSunDirection();

/**
 * Earth component with shader material
 */
function Earth({ onClick }) {
  const meshRef = useRef();
  
  // Load all three textures
  const [dayTexture, nightTexture, specularCloudsTexture] = useLoader(
    THREE.TextureLoader,
    ['/earth/day.jpg', '/earth/night.jpg', '/earth/specularClouds.jpg']
  );

  // Configure textures
  useMemo(() => {
    // Day and night are in sRGB
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = 8;
    
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.anisotropy = 8;
    
    // Specular clouds is linear
    specularCloudsTexture.anisotropy = 8;
  }, [dayTexture, nightTexture, specularCloudsTexture]);

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
      uniforms: {
        uDayTexture: { value: dayTexture },
        uNightTexture: { value: nightTexture },
        uSpecularCloudsTexture: { value: specularCloudsTexture },
        uSunDirection: { value: sunDirection },
        uAtmosphereDayColor: { value: new THREE.Color(earthParameters.atmosphereDayColor) },
        uAtmosphereTwilightColor: { value: new THREE.Color(earthParameters.atmosphereTwilightColor) }
      }
    });
  }, [dayTexture, nightTexture, specularCloudsTexture]);

  // Update sun direction (no rotation - satellites are in Earth-fixed coordinates)
  useFrame((state, delta) => {
    // Don't rotate Earth - satellites are calculated relative to Earth's surface
    // if (meshRef.current) {
    //   meshRef.current.rotation.y += delta * 0.05;
    // }
    
    // Update sun direction in real-time
    updateSunDirection();
    material.uniforms.uSunDirection.value.copy(sunDirection);
    material.uniforms.uSunDirection.needsUpdate = true;
    
    // Debug every 60 frames (~1 second)
    if (Math.floor(state.clock.elapsedTime) % 10 === 0 && state.clock.elapsedTime % 1 < 0.1) {
      const now = new Date();
      const utc = `${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
      console.log(`☀️ UTC ${utc} | Sun Direction: (${sunDirection.x.toFixed(2)}, ${sunDirection.y.toFixed(2)}, ${sunDirection.z.toFixed(2)})`);
    }
  });

  return (
    <mesh 
      ref={meshRef} 
      material={material} 
      onClick={onClick}
    >
      <sphereGeometry args={[2, 128, 128]} />
    </mesh>
  );
}

/**
 * Atmosphere component - renders atmospheric glow
 */
function Atmosphere() {
  const meshRef = useRef();
  
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        uSunDirection: { value: sunDirection },
        uAtmosphereDayColor: { value: new THREE.Color(earthParameters.atmosphereDayColor) },
        uAtmosphereTwilightColor: { value: new THREE.Color(earthParameters.atmosphereTwilightColor) }
      },
      side: THREE.BackSide,
      transparent: true
    });
  }, []);

  // Update uniforms
  useFrame(() => {
    updateSunDirection();
    material.uniforms.uSunDirection.value.copy(sunDirection);
  });

  return (
    <mesh ref={meshRef} material={material} scale={1.04}>
      <sphereGeometry args={[2, 128, 128]} />
    </mesh>
  );
}

/**
 * Billboard Text Component that always faces camera
 */
function BillboardText({ children, position, color }) {
  const ref = useRef();
  
  useFrame(({ camera }) => {
    if (ref.current) {
      ref.current.quaternion.copy(camera.quaternion);
    }
  });
  
  return (
    <group ref={ref} position={position}>
      <Text
        fontSize={0.025}
        color={color}
        anchorX="left"
        anchorY="middle"
        outlineWidth={0.002}
        outlineColor="#000000"
        outlineOpacity={0.8}
        letterSpacing={0.08}
      >
        {children.toString().toUpperCase()}
      </Text>
    </group>
  );
}

/**
 * Satellites component
 */
function Satellites({ onSelectSatellite, selectedSatellite, onSatellitesLoaded }) {
  const [satellites, setSatellites] = useState([]);
  const [positions, setPositions] = useState([]);
  const [hoveredSatellite, setHoveredSatellite] = useState(null);

  // Load satellites on mount with saved limits
  useEffect(() => {
    async function loadSatellites() {
      // Load limits from localStorage
      const savedLimits = localStorage.getItem('satelliteLimits');
      const limits = savedLimits ? JSON.parse(savedLimits) : {};
      
      console.log('🛰️ Loading satellites with limits:', limits);
      const sats = await fetchSatelliteTLEs(limits);
      setSatellites(sats);
      console.log(`✅ Loaded ${sats.length} satellites`);
      if (onSatellitesLoaded) {
        onSatellitesLoaded(sats);
      }
    }
    loadSatellites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update positions smoothly every frame
  useFrame((state) => {
    if (satellites.length === 0) return;
    
    // Update positions every frame for smooth movement
    const newPositions = satellites
      .map(sat => {
        const pos = getSatellitePosition(sat, Date.now());
        if (!pos) return null;
        const cartesian = latLonAltToCartesian(pos.latitude, pos.longitude, pos.altitude);
        return { 
          ...cartesian, 
          name: sat.name,
          altitude: pos.altitude,
          latitude: pos.latitude,
          longitude: pos.longitude,
          type: pos.type || sat.type,
          color: pos.color,
          size: pos.size
        };
      })
      .filter(Boolean);
    
    if (newPositions.length > 0) {
      setPositions(newPositions);
    }
  });

  // Size mapping - smaller satellites for cleaner view
  const getSizeRadius = (size) => {
    switch(size) {
      case 'large': return 0.035;
      case 'medium': return 0.015;
      case 'small': return 0.015;
      default: return 0.015;
    }
  };

  return (
    <group>
      {positions.map((pos, i) => {
        const isSelected = selectedSatellite === i;
        const isHovered = hoveredSatellite === i;
        const baseSize = getSizeRadius(pos.size);
        
        // Get color from satellite category
        const sat = satellites[i];
        const baseColor = getSatelliteColor(sat);
        
        // Selected = yellow & 2x size, Hovered = white & 1.5x size, Normal = category color & size
        let radius = baseSize;
        let color = baseColor;
        let glowOpacity = 0.3;
        let lightIntensity = 0.3;
        
        if (isSelected) {
          radius = baseSize * 2;
          color = '#ffff00';
          glowOpacity = 0.5;
          lightIntensity = 0.6;
        } else if (isHovered) {
          radius = baseSize * 1.5;
          color = '#ffffff';
          glowOpacity = 0.4;
          lightIntensity = 0.45;
        }
        
        return (
          <group key={i} position={[pos.x, pos.y, pos.z]}>
            {/* Main satellite dot - clickable and hoverable */}
            <mesh 
              onClick={(e) => {
                e.stopPropagation();
                onSelectSatellite(i, pos, satellites[i]);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredSatellite(i);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHoveredSatellite(null);
                document.body.style.cursor = 'default';
              }}
            >
              <sphereGeometry args={[radius, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
            {/* Glow effect */}
            <mesh>
              <sphereGeometry args={[radius * 2, 8, 8]} />
              <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={glowOpacity}
              />
            </mesh>
            {/* Point light for extra visibility */}
            <pointLight color={color} intensity={lightIntensity} distance={0.5} />
            {/* Satellite name label - always faces camera, positioned closer */}
            <BillboardText position={[0.04, 0.04, 0]} color={color}>
              {pos.name}
            </BillboardText>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Get color based on satellite category
 */
function getSatelliteColor(satellite) {
  const category = satellite.category?.toLowerCase() || satellite.type?.toLowerCase() || '';
  
  if (category.includes('starlink')) return '#00ffff'; // Cyan
  if (category.includes('iss') || satellite.name?.toLowerCase().includes('iss')) return '#ffff00'; // Yellow
  if (category.includes('gps')) return '#00ff00'; // Green
  if (category.includes('weather')) return '#ff8800'; // Orange
  if (category.includes('geostationary')) return '#ff00ff'; // Magenta
  if (category.includes('amateur')) return '#00ff88'; // Teal
  if (category.includes('brightest')) return '#ffffff'; // White
  
  return '#00ffff'; // Default cyan
}

/**
 * Orbital trajectory component - draws complete orbit path
 */
function OrbitPath({ satellite, color }) {
  const points = useMemo(() => {
    if (!satellite) return [];
    
    const orbitPoints = [];
    const numPoints = 128; // More points for smoother orbit
    
    // Calculate orbit points over one full period
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      
      // For demo satellites with orbital parameters
      if (satellite.isDemoMode) {
        const inclination = satellite.inclination * Math.PI / 180;
        const latitude = Math.asin(Math.sin(inclination) * Math.sin(angle)) * 180 / Math.PI;
        const longitude = ((satellite.longitude || 0) + angle * 180 / Math.PI) % 360;
        const adjustedLon = longitude > 180 ? longitude - 360 : longitude;
        
        const cartesian = latLonAltToCartesian(latitude, adjustedLon, satellite.altitude);
        orbitPoints.push(new THREE.Vector3(cartesian.x, cartesian.y, cartesian.z));
      } else {
        // For real TLE satellites, calculate full orbit period
        const now = Date.now();
        const timeStep = 90 * 60 * 1000 / numPoints; // ~90 min orbit divided by points
        const pos = getSatellitePosition(satellite, now + i * timeStep);
        if (pos) {
          const cartesian = latLonAltToCartesian(pos.latitude, pos.longitude, pos.altitude);
          orbitPoints.push(new THREE.Vector3(cartesian.x, cartesian.y, cartesian.z));
        }
      }
    }
    
    return orbitPoints;
  }, [satellite]);

  if (points.length === 0) return null;

  return (
    <lineLoop>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} opacity={0.5} transparent />
    </lineLoop>
  );
}

/**
 * Main Earth3D component
 */
function Earth3D() {
  const ambientRef = useRef();
  const [utcTime, setUtcTime] = useState('');
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [satelliteInfo, setSatelliteInfo] = useState(null);
  const [selectedSatelliteData, setSelectedSatelliteData] = useState(null);
  const [showAllPaths, setShowAllPaths] = useState(false);
  const [allSatellites, setAllSatellites] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  
  // Load satellite limits from localStorage or use defaults
  const [satLimits, setSatLimits] = useState(() => {
    const saved = localStorage.getItem('satelliteLimits');
    return saved ? JSON.parse(saved) : {
      maxTotal: 100,
      starlink: 30,
      gps: 15,
      iss: 1,
      weather: 10,
      brightest: 20,
      geostationary: 10,
      amateur: 10
    };
  });

  // Handle satellites loaded - memoized to prevent infinite loops
  const handleSatellitesLoaded = useCallback((sats) => {
    setAllSatellites(sats);
  }, []);

  // Calculate orbital velocity
  const calculateOrbitalSpeed = (altitude) => {
    const earthRadius = 6371; // km
    const orbitRadius = earthRadius + altitude;
    const GM = 398600; // Earth's gravitational parameter (km³/s²)
    const velocity = Math.sqrt(GM / orbitRadius); // km/s
    return velocity.toFixed(2);
  };

  // Handle satellite selection - toggle if same, switch if different
  const handleSelectSatellite = async (index, position, satellite) => {
    // If clicking the same satellite, deselect it
    if (selectedSatellite === index) {
      setSelectedSatellite(null);
      setSelectedSatelliteData(null);
      setSatelliteInfo(null);
    } else {
      // Select the new satellite
      const altitude = position.altitude || satellite?.altitude || 0;
      
      setSelectedSatellite(index);
      setSelectedSatelliteData(satellite);
      
      // Set initial info without decay rate
      setSatelliteInfo({
        name: satellite?.name || position.name || 'Unknown',
        type: satellite?.type || 'Satellite',
        altitude: altitude,
        color: position.color || '#00ffff',
        latitude: position.latitude,
        longitude: position.longitude,
        // Additional metadata from satellite object
        fullName: satellite?.fullName,
        operator: satellite?.operator,
        purpose: satellite?.purpose,
        launchDate: satellite?.launchDate,
        mass: satellite?.mass,
        country: satellite?.country,
        orbitalPeriod: satellite?.orbitalPeriod,
        image: satellite?.image,
        orbitalSpeed: calculateOrbitalSpeed(altitude),
        inclination: satellite?.inclination,
        decayRate: null
      });
      
      // Fetch decay data for all satellites (rate limit has been reset)
      if (satellite?.id || satellite?.satid || satellite?.noradId) {
        try {
          const noradId = satellite.id || satellite.satid || satellite.noradId;
          console.log('Fetching decay data for NORAD ID:', noradId);
          const response = await fetch(`http://localhost:5000/api/satellite/${noradId}`);
          if (response.ok) {
            const data = await response.json();
            console.log('ML API response:', data);
            // Store full prediction data and update altitude to match backend's TLE data
            setSatelliteInfo(prev => ({
              ...prev,
              altitude: data.current_state?.altitude_km || prev.altitude, // Use backend altitude for consistency
              decayData: data,
              decayRate: data.predictions?.['7_day']?.daily_rate_km,
              noradId: noradId
            }));
          } else {
            console.warn('ML API returned status:', response.status);
          }
        } catch (error) {
          console.warn('Could not fetch decay data from ML model:', error);
        }
      }
    }
  };

  // Handle deselection when clicking on Earth or background
  const handleDeselect = () => {
    setSelectedSatellite(null);
    setSelectedSatelliteData(null);
    setSatelliteInfo(null);
  };

  // Update UTC time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      const seconds = String(now.getUTCSeconds()).padStart(2, '0');
      setUtcTime(`${hours}:${minutes}:${seconds} UTC`);
    };
    
    updateTime(); // Initial update
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // GUI removed - replaced with title

  return (
    <div className="earth-3d-container">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ background: '#000000' }}
      >
        <ambientLight ref={ambientRef} intensity={earthParameters.ambientIntensity} />
        
        <Stars radius={100} depth={50} count={8000} factor={4} saturation={0} fade speed={0.5} />
        
        <Suspense fallback={null}>
          <Earth onClick={handleDeselect} />
          <Atmosphere />
          <Satellites 
            onSelectSatellite={handleSelectSatellite} 
            selectedSatellite={selectedSatellite}
            onSatellitesLoaded={handleSatellitesLoaded}
          />
          {/* Show selected satellite path */}
          {!showAllPaths && selectedSatelliteData && (
            <OrbitPath 
              satellite={selectedSatelliteData} 
              color={getSatelliteColor(selectedSatelliteData)}
            />
          )}
          {/* Show all satellite paths when toggled */}
          {showAllPaths && allSatellites.map((sat, i) => (
            <OrbitPath 
              key={i}
              satellite={sat} 
              color={getSatelliteColor(sat)}
            />
          ))}
        </Suspense>
        
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={2.5}
          maxDistance={50}
          autoRotate={true}
          autoRotateSpeed={0.15}
          enableDamping={true}
          dampingFactor={0.05}
        />
      </Canvas>
      
      {/* Title Header - Top Left */}
      <div style={{
        position: 'absolute',
        top: '30px',
        left: '30px',
        zIndex: 100,
        pointerEvents: 'none'
      }}>
        <div style={{
          fontSize: '42px',
          fontWeight: 'bold',
          color: '#00ffff',
          fontFamily: 'monospace',
          textShadow: '0 0 20px rgba(0, 255, 255, 0.8), 0 0 40px rgba(0, 255, 255, 0.4)',
          letterSpacing: '2px',
          marginBottom: '5px'
        }}>
          DONT PANIC
        </div>
        <div style={{
          fontSize: '14px',
          color: '#888',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '3px',
          textShadow: '0 0 10px rgba(136, 136, 136, 0.5)'
        }}>
          Satellite Monitoring System
        </div>
      </div>
      
      {/* Toggle All Paths Button */}
      <button
        onClick={() => setShowAllPaths(!showAllPaths)}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '160px',
          background: showAllPaths ? 'rgba(0, 255, 255, 0.08)' : 'rgba(0, 255, 255, 0.05)',
          border: showAllPaths ? '1px solid #00ffff' : '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '3px',
          padding: '8px 18px',
          color: '#00ffff',
          fontSize: '11px',
          fontFamily: 'monospace',
          fontWeight: 'normal',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          cursor: 'pointer',
          boxShadow: showAllPaths ? '0 0 20px rgba(0, 255, 255, 0.4)' : '0 0 8px rgba(0, 255, 255, 0.15)',
          textShadow: showAllPaths ? '0 0 10px rgba(0, 255, 255, 0.8)' : 'none',
          transition: 'all 0.3s ease',
          zIndex: 100,
          backdropFilter: 'blur(10px)'
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(0, 255, 255, 0.1)';
          e.target.style.borderColor = '#00ffff';
          e.target.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.4)';
          e.target.style.textShadow = '0 0 10px rgba(0, 255, 255, 0.8)';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = showAllPaths ? 'rgba(0, 255, 255, 0.08)' : 'rgba(0, 255, 255, 0.05)';
          e.target.style.borderColor = showAllPaths ? '#00ffff' : 'rgba(0, 255, 255, 0.3)';
          e.target.style.boxShadow = showAllPaths ? '0 0 20px rgba(0, 255, 255, 0.4)' : '0 0 8px rgba(0, 255, 255, 0.15)';
          e.target.style.textShadow = showAllPaths ? '0 0 10px rgba(0, 255, 255, 0.8)' : 'none';
        }}
      >
        {showAllPaths ? 'All Paths ON' : 'Show All Paths'}
      </button>

      {/* Settings Button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          background: 'rgba(0, 255, 255, 0.05)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '3px',
          padding: '8px 18px',
          color: '#00ffff',
          fontSize: '11px',
          fontFamily: 'monospace',
          fontWeight: 'normal',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          cursor: 'pointer',
          boxShadow: '0 0 8px rgba(0, 255, 255, 0.15)',
          transition: 'all 0.3s ease',
          zIndex: 100,
          backdropFilter: 'blur(10px)'
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(0, 255, 255, 0.1)';
          e.target.style.borderColor = '#00ffff';
          e.target.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.4)';
          e.target.style.textShadow = '0 0 10px rgba(0, 255, 255, 0.8)';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(0, 255, 255, 0.05)';
          e.target.style.borderColor = 'rgba(0, 255, 255, 0.3)';
          e.target.style.boxShadow = '0 0 8px rgba(0, 255, 255, 0.15)';
          e.target.style.textShadow = 'none';
        }}
      >
        Settings
      </button>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'absolute',
          bottom: '70px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.9)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '3px',
          padding: '20px',
          minWidth: '320px',
          color: '#00ffff',
          fontFamily: 'monospace',
          fontSize: '11px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
          zIndex: 101
        }}>
          <div style={{ marginBottom: '15px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px' }}>
            Satellite Limits
          </div>
          
          {Object.entries(satLimits).map(([key, value]) => (
            <div key={key} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}:</label>
              <input
                type="number"
                value={value}
                onChange={(e) => setSatLimits({...satLimits, [key]: parseInt(e.target.value) || 0})}
                style={{
                  width: '60px',
                  background: 'rgba(0, 255, 255, 0.1)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '2px',
                  padding: '4px 8px',
                  color: '#00ffff',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}
              />
            </div>
          ))}
          
          <button
            onClick={() => {
              // Save limits to localStorage
              localStorage.setItem('satelliteLimits', JSON.stringify(satLimits));
              setShowSettings(false);
              // Reload to fetch with new limits
              window.location.reload();
            }}
            style={{
              width: '100%',
              marginTop: '15px',
              background: 'rgba(0, 255, 255, 0.1)',
              border: '1px solid #00ffff',
              borderRadius: '3px',
              padding: '8px',
              color: '#00ffff',
              fontSize: '11px',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              cursor: 'pointer'
            }}
          >
            Apply & Reload
          </button>
        </div>
      )}

      {/* UTC Time Display */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#00ffff',
        fontSize: '18px',
        fontFamily: 'monospace',
        textShadow: '0 0 10px rgba(0, 255, 255, 0.8)',
        pointerEvents: 'none',
        zIndex: 100
      }}>
        {utcTime}
      </div>
      
      {/* Satellite Info Panel - Enhanced with More Details */}
      {satelliteInfo && (
        <div style={{
          position: 'absolute',
          top: '165px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.7)',
          border: `1px solid rgba(0, 255, 255, 0.3)`,
          borderRadius: '3px',
          padding: '20px',
          minWidth: '380px',
          maxWidth: '420px',
          maxHeight: 'calc(85vh - 165px)',
          overflowY: 'auto',
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '11px',
          backdropFilter: 'blur(10px)',
          boxShadow: `0 0 8px rgba(0, 255, 255, 0.15)`,
          zIndex: 100
        }}>
          {/* Header with Icon */}
          <div style={{ 
            fontSize: '32px',
            textAlign: 'center',
            marginBottom: '10px'
          }}>
            {satelliteInfo.image || '🛰️'}
          </div>
          
          {/* Satellite Name */}
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 'normal', 
            color: '#00ffff',
            marginBottom: '8px',
            textShadow: '0 0 8px rgba(0, 255, 255, 0.3)',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '2px'
          }}>
            {satelliteInfo.name}
          </div>
          
          {/* Full Name */}
          {satelliteInfo.fullName && (
            <div style={{ 
              fontSize: '9px', 
              color: '#888',
              marginBottom: '18px',
              textAlign: 'center',
              fontStyle: 'normal',
              letterSpacing: '1px'
            }}>
              {satelliteInfo.fullName}
            </div>
          )}
          
          {/* Divider */}
          <div style={{ 
            borderTop: '1px solid rgba(0, 255, 255, 0.2)', 
            marginBottom: '15px' 
          }} />
          
          {/* Position Data */}
          <div style={{ fontSize: '11px', lineHeight: '1.8', marginBottom: '15px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>
            <div style={{ fontWeight: 'normal', color: '#00ffff', marginBottom: '8px', letterSpacing: '2px', fontSize: '9px' }}>📍 Current Position</div>
            <div><span style={{ color: '#888' }}>NORAD ID:</span> {satelliteInfo.noradId || 'N/A'}</div>
            <div><span style={{ color: '#888' }}>Altitude:</span> {Math.round(satelliteInfo.altitude)} km</div>
            <div><span style={{ color: '#888' }}>Latitude:</span> {satelliteInfo.latitude?.toFixed(2)}°</div>
            <div><span style={{ color: '#888' }}>Longitude:</span> {satelliteInfo.longitude?.toFixed(2)}°</div>
            <div><span style={{ color: '#888' }}>Orbital Speed:</span> {satelliteInfo.orbitalSpeed} km/s</div>
          </div>

          {/* Decay Predictions Section */}
          {satelliteInfo.decayData && (
            <>
              {/* Risk Assessment */}
              <div style={{ marginBottom: '15px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: `conic-gradient(${
                    satelliteInfo.decayData.risk_assessment?.risk_score >= 70 ? '#ff4444' :
                    satelliteInfo.decayData.risk_assessment?.risk_score >= 40 ? '#ffaa00' : '#00ff88'
                  } ${satelliteInfo.decayData.risk_assessment?.risk_score * 3.6}deg, #1a1a1a 0deg)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  border: '3px solid #333',
                  marginBottom: '8px'
                }}>
                  {satelliteInfo.decayData.risk_assessment?.risk_score || 0}
                </div>
                <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
                  {satelliteInfo.decayData.risk_assessment?.risk_score >= 70 ? '🔴 HIGH RISK' :
                   satelliteInfo.decayData.risk_assessment?.risk_score >= 40 ? '🟡 MEDIUM RISK' : '🟢 LOW RISK'}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Confidence: {Math.round((satelliteInfo.decayData.risk_assessment?.confidence || 0) * 100)}%
                </div>
              </div>

              {/* Decay Predictions Table */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', color: satelliteInfo.color, marginBottom: '10px', fontSize: '14px' }}>
                  📉 Decay Predictions
                </div>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #333' }}>
                      <th style={{ padding: '6px', textAlign: 'left', color: '#aaa' }}>Horizon</th>
                      <th style={{ padding: '6px', textAlign: 'right', color: '#aaa' }}>Change</th>
                      <th style={{ padding: '6px', textAlign: 'right', color: '#aaa' }}>Daily Rate</th>
                      <th style={{ padding: '6px', textAlign: 'right', color: '#aaa' }}>Future Alt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['7_day', '30_day', '90_day'].map((horizon) => {
                      const pred = satelliteInfo.decayData.predictions?.[horizon];
                      if (!pred) return null;
                      const days = horizon.split('_')[0];
                      return (
                        <tr key={horizon} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '8px', color: '#ccc' }}>{days} day</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: pred.change_km < 0 ? '#ff6666' : '#66ff66' }}>
                            {pred.change_km > 0 ? '+' : ''}{pred.change_km.toFixed(2)} km
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#00ffff' }}>
                            {pred.daily_rate_km.toFixed(3)} km/day
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                            {pred.altitude_km.toFixed(2)} km
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Altitude Prediction Graph */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', color: satelliteInfo.color, marginBottom: '8px', fontSize: '13px' }}>
                  📊 Altitude Forecast
                </div>
                <div style={{ 
                  height: '80px', 
                  display: 'flex', 
                  alignItems: 'flex-end', 
                  gap: '4px',
                  background: '#0a0a0a',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #222'
                }}>
                  {(() => {
                    console.log('🔍 Altitude Forecast Debug:', {
                      current: satelliteInfo.altitude,
                      predictions: satelliteInfo.decayData?.predictions
                    });
                    
                    // Get all altitudes for scaling (outside the map)
                    const allAltitudes = [
                      satelliteInfo.altitude,
                      satelliteInfo.decayData.predictions?.['7_day']?.altitude_km,
                      satelliteInfo.decayData.predictions?.['30_day']?.altitude_km,
                      satelliteInfo.decayData.predictions?.['90_day']?.altitude_km
                    ].filter(a => a != null && !isNaN(a));
                    
                    const maxAlt = Math.max(...allAltitudes);
                    const minAlt = Math.min(...allAltitudes);
                    const range = maxAlt - minAlt || 100;
                    
                    return ['current', '7_day', '30_day', '90_day'].map((key, idx) => {
                      const altitude = key === 'current' 
                        ? satelliteInfo.altitude 
                        : satelliteInfo.decayData.predictions?.[key]?.altitude_km;
                      
                      console.log(`  ${key}: ${altitude}`);
                      
                      const heightPercent = altitude != null ? ((altitude - minAlt) / range) * 100 : 0;
                      
                      return (
                        <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <div style={{
                            width: '100%',
                            height: `${Math.max(heightPercent, 5)}%`,
                            background: key === 'current' ? '#00ffff' : 'linear-gradient(to top, #0088ff, #00ffff)',
                            borderRadius: '2px 2px 0 0',
                            position: 'relative'
                          }}>
                            <div style={{
                              position: 'absolute',
                              top: '-18px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              fontSize: '9px',
                              color: '#00ffff',
                              whiteSpace: 'nowrap'
                            }}>
                              {altitude != null ? altitude.toFixed(0) : 'N/A'}
                            </div>
                          </div>
                          <div style={{ fontSize: '9px', color: '#666', textAlign: 'center' }}>
                            {key === 'current' ? 'Now' : key.split('_')[0] + 'd'}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Solar Conditions */}
              {satelliteInfo.decayData.solar_conditions && (
                <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '15px' }}>
                  <div style={{ fontWeight: 'bold', color: satelliteInfo.color, marginBottom: '8px' }}>
                    ☀️ Solar Conditions
                  </div>
                  <div><span style={{ color: '#aaa' }}>F10.7 Solar Flux:</span> <strong>{satelliteInfo.decayData.solar_conditions.f107?.toFixed(1) || 'N/A'} sfu</strong></div>
                  <div><span style={{ color: '#aaa' }}>Observed:</span> <strong>{satelliteInfo.decayData.solar_conditions.observation_time || 'Recent'}</strong></div>
                </div>
              )}
            </>
          )}
          
          {/* Orbital Parameters */}
          {(satelliteInfo.inclination || satelliteInfo.orbitalPeriod) && (
            <div style={{ fontSize: '11px', lineHeight: '1.8', marginBottom: '15px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>
              <div style={{ fontWeight: 'normal', color: '#00ffff', marginBottom: '8px', letterSpacing: '2px', fontSize: '9px' }}>🛸 Orbital Parameters</div>
              {satelliteInfo.inclination && (
                <div><span style={{ color: '#888' }}>Inclination:</span> {satelliteInfo.inclination.toFixed(1)}°</div>
              )}
              {satelliteInfo.orbitalPeriod && (
                <div><span style={{ color: '#888' }}>Orbital Period:</span> {satelliteInfo.orbitalPeriod}</div>
              )}
            </div>
          )}
          
          {/* Mission Info */}
          {(satelliteInfo.operator || satelliteInfo.purpose || satelliteInfo.country) && (
            <div style={{ fontSize: '11px', lineHeight: '1.8', marginBottom: '15px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>
              <div style={{ fontWeight: 'normal', color: '#00ffff', marginBottom: '8px', letterSpacing: '2px', fontSize: '9px' }}>ℹ️ Mission Information</div>
              {satelliteInfo.operator && (
                <div><span style={{ color: '#888' }}>Operator:</span> {satelliteInfo.operator}</div>
              )}
              {satelliteInfo.purpose && (
                <div><span style={{ color: '#888' }}>Purpose:</span> {satelliteInfo.purpose}</div>
              )}
              {satelliteInfo.country && (
                <div><span style={{ color: '#888' }}>Country:</span> {satelliteInfo.country}</div>
              )}
            </div>
          )}
          
          {/* Technical Specs */}
          {(satelliteInfo.launchDate || satelliteInfo.mass) && (
            <div style={{ fontSize: '11px', lineHeight: '1.8', marginBottom: '15px', fontWeight: 'normal', letterSpacing: '2px', textTransform: 'uppercase' }}>
              <div style={{ fontWeight: 'normal', color: '#00ffff', marginBottom: '8px', letterSpacing: '2px', fontSize: '9px' }}>🔧 Technical Specs</div>
              {satelliteInfo.launchDate && (
                <div><span style={{ color: '#888' }}>Launch Date:</span> {satelliteInfo.launchDate}</div>
              )}
              {satelliteInfo.mass && (
                <div><span style={{ color: '#888' }}>Mass:</span> {satelliteInfo.mass}</div>
              )}
              <div><span style={{ color: '#888' }}>Type:</span> {satelliteInfo.type}</div>
            </div>
          )}
          
          {/* Footer */}
          <div style={{ 
            marginTop: '15px',
            paddingTop: '12px',
            borderTop: `1px solid ${satelliteInfo.color}`,
            opacity: 0.3
          }} />
          <div style={{ 
            marginTop: '10px', 
            fontSize: '11px', 
            color: '#666',
            textAlign: 'center'
          }}>
            Click satellite again to deselect
          </div>
        </div>
      )}
    </div>
  );
}

export default Earth3D;
