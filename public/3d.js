// Leaducate 3D Particle Background for the landing (Home) page
// Uses Three.js from CDN
// Exposes window.initLeaducate3D so it can be (re)initialized after
// the home view is rendered dynamically by the SPA.

(function init3D() {
  // Expose a global initializer so the SPA can re-run the scene whenever
  // the home view (and its #hero-3d container) is (re)rendered.
  window.initLeaducate3D = runScene;

  if (typeof THREE === 'undefined') {
    // Load Three.js if not already loaded
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = runScene;
    document.head.appendChild(script);
  } else {
    // THREE already present — defer to first render() call.
  }

  function runScene() {
    const container = document.getElementById('hero-3d');
    if (!container) return;

    // Idempotent: remove any previously rendered canvas before re-initializing.
    const existing = container.querySelector('canvas');
    if (existing) existing.remove();

    const width = container.clientWidth || window.innerWidth;
    const height = Math.max(container.clientHeight || 400, 400);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 30;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Color palette
    const colors = [
      new THREE.Color('#7C3AED'), // purple
      new THREE.Color('#9D5CF6'), // purple light
      new THREE.Color('#6366F1'), // indigo
      new THREE.Color('#22C55E'), // green
      new THREE.Color('#06B6D4'), // cyan
      new THREE.Color('#F59E0B'), // amber
    ];

    // Create particles
    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const radius = 12 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;

      positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.cos(theta);

      const color = colors[Math.floor(Math.random() * colors.length)];
      particleColors[i * 3] = color.r;
      particleColors[i * 3 + 1] = color.g;
      particleColors[i * 3 + 2] = color.b;

      sizes[i] = 0.3 + Math.random() * 0.7;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Connection lines between close particles
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x7C3AED,
      transparent: true,
      opacity: 0.08,
    });

    // Mouse interaction
    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0;
    let targetRotY = 0;

    document.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = Math.max(container.clientHeight || 400, 400);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let time = 0;

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      time += 0.003;

      targetRotX = mouseY * 0.3 + Math.sin(time * 0.2) * 0.1;
      targetRotY = mouseX * 0.3 + Math.cos(time * 0.15) * 0.1;

      particles.rotation.x += (targetRotX - particles.rotation.x) * 0.02;
      particles.rotation.y += (targetRotY - particles.rotation.y) * 0.02;

      // Gentle pulse effect on size
      material.size = 0.35 + Math.sin(time * 2) * 0.1;

      renderer.render(scene, camera);
    }

    animate();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      renderer.dispose();
    });
  }
})();