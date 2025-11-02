import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import './Earth3D.css';

/**
 * Main 3D Earth visualization component
 */
function Earth3D() {
  return (
    <div className="earth-3d-container">
      <Canvas
        camera={{ position: [0, 0, 20000], fov: 50, near: 100, far: 100000 }}
        style={{ background: '#000000' }}
      >
        {/* Dim lighting for night Earth effect */}
        <ambientLight intensity={0.08} />
        <hemisphereLight args={[0x223355, 0x00000a, 0.25]} />
        <directionalLight position={[10000, 8000, 12000]} intensity={0.35} />
        <pointLight position={[-15000, -12000, -15000]} intensity={0.15} color="#2244aa" />
        
        {/* Brilliant star field for night sky */}
        <Stars radius={80000} depth={50} count={8000} factor={5} saturation={0} fade speed={0.3} />
        
        {/* Earth */}
        <Earth />
        {/* Atmosphere rim glow */}
        <Atmosphere />
        {/* Latitude/Longitude grid for a technical look */}
        <LatLongGrid />
        
        {/* Camera controls - Smooth damping for professional feel */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={8000}
          maxDistance={40000}
          autoRotate={true}
          enableDamping={true}
          dampingFactor={0.05}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
        />
      </Canvas>
    </div>
  );
}

/**
 * Beautiful Night Earth with glowing city lights
 */
function Earth() {
  const earthRef = useRef();
  const EARTH_RADIUS = 6371; // km

  // Rotate Earth slowly
  useFrame((state, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.05; // Smooth rotation
    }
  });

  // Create procedural city lights texture
  const cityLightsTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Dark night background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Generate random city lights clusters
    const numClusters = 2000;
    for (let i = 0; i < numClusters; i++) {
      // Concentrate lights in certain latitude bands (avoid poles)
      const lat = (Math.random() * 0.7 + 0.15) * canvas.height;
      const lon = Math.random() * canvas.width;
      
      // Cluster size and brightness
      const clusterSize = Math.random() * 15 + 5;
      const brightness = Math.random() * 0.5 + 0.5;
      
      // Create gradient for glow effect
      const gradient = ctx.createRadialGradient(lon, lat, 0, lon, lat, clusterSize);
      gradient.addColorStop(0, `rgba(255, 220, 150, ${brightness})`);
      gradient.addColorStop(0.3, `rgba(255, 180, 100, ${brightness * 0.6})`);
      gradient.addColorStop(0.7, `rgba(255, 140, 60, ${brightness * 0.3})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(lon - clusterSize, lat - clusterSize, clusterSize * 2, clusterSize * 2);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }, []);

  return (
    <group ref={earthRef}>
      {/* Dark Earth base */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshStandardMaterial
          color="#0a0a1a"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
      
      {/* City lights layer with emissive map */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS + 2, 64, 64]} />
        <meshBasicMaterial
          map={cityLightsTexture}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      
      {/* Additional glow layer */}
      <mesh scale={1.002}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshBasicMaterial
          color="#ffaa44"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Atmosphere rim glow (Fresnel-like shader)
 */
function Atmosphere() {
  const EARTH_RADIUS = 6371; // km
  const materialRef = useRef();

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#4aa3ff') },
      uIntensity: { value: 0.7 },
    }),
    []
  );

  const vertexShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(mat3(modelMatrix) * normal);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    uniform vec3 uColor;
    uniform float uIntensity;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 3.0);
      vec3 col = uColor * fresnel * uIntensity;
      gl_FragColor = vec4(col, fresnel * 0.6);
    }
  `;

  return (
    <mesh scale={1.035}>
      <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader, fragmentShader, transparent: true }]}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Latitude / Longitude grid lines
 */
function LatLongGrid({ radius = 6371, step = 15, segments = 128 }) {
  const latLines = useMemo(() => {
    const lines = [];
    for (let lat = -90 + step; lat <= 90 - step; lat += step) {
      const r = Math.cos(THREE.MathUtils.degToRad(lat)) * radius * 1.001;
      const y = Math.sin(THREE.MathUtils.degToRad(lat)) * radius * 1.001;
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r));
      }
      lines.push(pts);
    }
    return lines;
  }, [radius, step, segments]);

  const lonLines = useMemo(() => {
    const lines = [];
    for (let lon = 0; lon < 360; lon += step) {
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const t = -Math.PI / 2 + (i / segments) * Math.PI; // -90..+90
        const r = Math.cos(t) * radius * 1.001;
        const y = Math.sin(t) * radius * 1.001;
        const a = THREE.MathUtils.degToRad(lon);
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      lines.push(pts);
    }
    return lines;
  }, [radius, step, segments]);

  return (
    <group>
      {latLines.map((pts, i) => (
        <Line key={`lat-${i}`} points={pts} color="#00e5ff" lineWidth={0.8} transparent opacity={0.15} />
      ))}
      {lonLines.map((pts, i) => (
        <Line key={`lon-${i}`} points={pts} color="#00e5ff" lineWidth={0.7} transparent opacity={0.1} />
      ))}
    </group>
  );
}

export default Earth3D;
