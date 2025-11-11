import { optimizeSquare } from './optimizer.js';
import { calculateRoute, formatTime } from './router.js';

// Configuration Constants
const CONFIG = {
  SCAN_RADIUS_BUFFER: 20,      // Extra squares beyond ubersquadrat for scanning visited squares
  GRID_DISPLAY_BUFFER: 10,     // Extra squares to display in grid visualization
  GRID_LINE_COLOR: '#555555',  // Horizontal grid lines
  GRID_LINE_OPACITY: 1,
  GRID_VERTICAL_COLOR: '#888888',  // Vertical grid lines (lighter)
  GRID_VERTICAL_OPACITY: 0.3,
  UBERSQUADRAT_COLOR: '#0000ff',
  UBERSQUADRAT_OPACITY: 0.1,
  PROPOSED_COLOR: '#ffd700',
  PROPOSED_OPACITY: 0.3,
  VISITED_COLOR: '#00ff00',
  VISITED_BORDER_COLOR: '#007700',
  VISITED_OPACITY: 0.1,
  ROUTE_LINE_COLOR: '#ffff00ff',
  ROUTE_LINE_WEIGHT: 4,
  ROUTE_LINE_OPACITY: 0.7,
  START_MARKER_COLOR: '#00cc00',
  START_MARKER_RADIUS: 8,
  MAX_ROUTE_WAYPOINTS: 50,
  BROUTER_API_URL: 'https://brouter.de/brouter',
  DOM_IDS: {
    KML_SELECT: 'kmlSelect',
    OPTIMIZE_BTN: 'optimizeBtn',
    NUM_ADD: 'numAdd',
    DIRECTION: 'direction',
    OPTIMIZATION_MODE: 'optimizationMode',
    MAX_HOLE_SIZE: 'maxHoleSize',
    BIKE_TYPE: 'bikeType',
    ROUNDTRIP: 'roundtrip',
    SELECT_START_BTN: 'selectStartBtn',
    START_POINT_STATUS: 'startPointStatus',
    CALCULATE_ROUTE_BTN: 'calculateRouteBtn',
    ROUTE_DISTANCE: 'routeDistance',
    ROUTE_ELEVATION: 'routeElevation',
    ROUTE_TIME: 'routeTime',
    ROUTE_STATS: 'routeStats',
    ROUTE_EXPORT: 'routeExport',
    EXPORT_GPX_BTN: 'exportGpxBtn',
    EXPORT_KML_BTN: 'exportKmlBtn'
  }
};

// Leaflet Map
const map = L.map('map').setView([51.7,8.3],10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Map Layers
const visitedLayer = L.layerGroup().addTo(map);
const proposedLayer = L.layerGroup().addTo(map);
const gridLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);

// Application State
const AppState = {
  grid: {
    latStep: null,
    lonStep: null,
    originLat: null,
    originLon: null
  },
  visitedSet: new Set(),
  baseSquare: null,
  kmlLoading: false,
  routing: {
    startPoint: null,           // { lat, lon } or null
    selectingStartPoint: false,  // Whether user is clicking to select start
    currentRoute: null,          // Route data from BRouter
    routeGeoJSON: null           // Parsed GeoJSON for display
  },

  reset() {
    this.visitedSet.clear();
    this.baseSquare = null;
    this.grid = { latStep: null, lonStep: null, originLat: null, originLon: null };
  },

  resetRoute() {
    this.routing.startPoint = null;
    this.routing.selectingStartPoint = false;
    this.routing.currentRoute = null;
    this.routing.routeGeoJSON = null;
    routeLayer.clearLayers();
    this.updateRouteUI();
  },

  updateRouteUI() {
    const statusEl = document.getElementById(CONFIG.DOM_IDS.START_POINT_STATUS);
    const routeBtn = document.getElementById(CONFIG.DOM_IDS.CALCULATE_ROUTE_BTN);
    const statsEl = document.getElementById(CONFIG.DOM_IDS.ROUTE_STATS);
    const exportEl = document.getElementById(CONFIG.DOM_IDS.ROUTE_EXPORT);

    if (this.routing.startPoint) {
      statusEl.textContent = `Startpunkt: ${this.routing.startPoint.lat.toFixed(5)}, ${this.routing.startPoint.lon.toFixed(5)}`;
      statusEl.style.color = '#00cc00';
      routeBtn.disabled = false;
    } else {
      statusEl.textContent = 'Kein Startpunkt gewählt';
      statusEl.style.color = '#666';
      routeBtn.disabled = true;
    }

    if (this.routing.currentRoute) {
      statsEl.style.display = 'block';
      exportEl.style.display = 'block';
    } else {
      statsEl.style.display = 'none';
      exportEl.style.display = 'none';
    }
  },

  isReady() {
    return this.grid.latStep !== null && !this.kmlLoading;
  },

  setLoading(loading) {
    this.kmlLoading = loading;
    const btn = document.getElementById(CONFIG.DOM_IDS.OPTIMIZE_BTN);
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Loading...' : 'Optimieren';
    }
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Extracts polygon data from different geometry types
 * Handles Polygon, MultiPolygon, and GeometryCollection
 * @param {Object} geometry - GeoJSON geometry object
 * @returns {Array} Array of polygons with {outer, holes} structure
 */
function extractPolygons(geometry) {
  const polygons = [];

  if (geometry.type === 'Polygon') {
    polygons.push({
      outer: geometry.coordinates[0],
      holes: geometry.coordinates.slice(1)
    });
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(polyCoords => {
      polygons.push({
        outer: polyCoords[0],
        holes: polyCoords.slice(1)
      });
    });
  } else if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach(geom => {
      if (geom.type === 'Polygon') {
        polygons.push({
          outer: geom.coordinates[0],
          holes: geom.coordinates.slice(1)
        });
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(polyCoords => {
          polygons.push({
            outer: polyCoords[0],
            holes: polyCoords.slice(1)
          });
        });
      }
    });
  }

  return polygons;
}

/**
 * Calculates bounding box (min/max lat/lon) from coordinates
 * @param {Array} coords - Array of [lat, lon] coordinates
 * @returns {Object} {minLat, maxLat, minLon, maxLon}
 */
function calculateBounds(coords) {
  const lats = coords.map(p => p[0]);
  const lons = coords.map(p => p[1]);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };
}

/**
 * Ray casting algorithm to check if point is inside a polygon ring
 * @param {number} lat - Latitude of point to test
 * @param {number} lon - Longitude of point to test
 * @param {Array} ring - Array of [lat, lon] coordinates forming the ring
 * @returns {boolean} True if point is inside ring
 */
function isPointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const latI = ring[i][0], lonI = ring[i][1];
    const latJ = ring[j][0], lonJ = ring[j][1];

    const intersect = ((lonI > lon) !== (lonJ > lon))
        && (lat < (latJ - latI) * (lon - lonI) / (lonJ - lonI) + latI);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if point is inside polygon, accounting for holes
 * @param {number} lat - Latitude of point
 * @param {number} lon - Longitude of point
 * @param {Object} polygon - Polygon object with {outer, holes} structure
 * @returns {boolean} True if point is inside polygon and not in any hole
 */
function isPointInPolygonWithHoles(lat, lon, polygon) {
  // Must be inside outer ring
  if (!isPointInRing(lat, lon, polygon.outer)) {
    return false;
  }

  // Must not be inside any hole
  for (const hole of polygon.holes) {
    if (isPointInRing(lat, lon, hole)) {
      return false;
    }
  }

  return true;
}

// Initialize KML File Selector
fetch('/api/kmlfiles')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
    return r.json();
  })
  .then(files => {
    const sel = document.getElementById(CONFIG.DOM_IDS.KML_SELECT);
    files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
    if (files.length > 0) loadKml(files[0]);
    sel.addEventListener('change', () => loadKml(sel.value));
  })
  .catch(err => {
    console.error('Failed to load KML file list:', err);
    alert('Fehler beim Laden der KML-Dateiliste. Bitte laden Sie die Seite neu.');
  });

function loadKml(filename){
  AppState.setLoading(true);
  visitedLayer.clearLayers(); proposedLayer.clearLayers();
  const layer = omnivore.kml(`/data/${filename}`);

  layer.on('error', (err) => {
    console.error('KML loading error:', err);
    AppState.setLoading(false);
    alert(`Fehler beim Laden der KML-Datei "${filename}". Bitte versuchen Sie eine andere Datei.`);
  });

  layer.on('ready',()=>{
    try {
      const features = [];
      const allPolygons = []; // All polygons including ubersquadrats
      const candidates = [];

    layer.eachLayer(l=>{
      if(l.setStyle) l.setStyle({fillColor:'#00ff00',color:'#007700',fillOpacity:0.3});

      const featureName = l.feature?.properties?.name?.toLowerCase() || '';
      const isUbersquadrat = featureName.includes('ubersquadrat') && !featureName.includes('ubersquadratinho');
      const isUbersquadratinho = featureName.includes('ubersquadratinho') || featureName.includes('squadratinho');

      // Skip ubersquadratinho features completely
      if (isUbersquadratinho) {
        return;
      }

      if(l.feature?.geometry){
        const geometry = l.feature.geometry;

        // Skip non-polygon geometries
        if (geometry.type === 'Point') return;

        // Extract polygons using helper function
        const polygonsToProcess = extractPolygons(geometry);
        if (polygonsToProcess.length === 0) return;

        // Process each polygon (with holes)
        polygonsToProcess.forEach(polyData => {
          // Convert outer ring: [lon, lat] → [lat, lon]
          const outerLatLon = polyData.outer.map(c=>[c[1],c[0]]);

          // Convert holes: [lon, lat] → [lat, lon]
          const holesLatLon = polyData.holes.map(hole => hole.map(c=>[c[1],c[0]]));

          // Add all polygons to allPolygons with full structure
          allPolygons.push({
            outer: outerLatLon,
            holes: holesLatLon
          });

          if(isUbersquadrat){
            candidates.push({
              name: l.feature.properties.name,
              coords: outerLatLon,  // Keep coords for compatibility
              size: parseInt(l.feature.properties.size) || 16
            });
          } else {
            // Only add non-ubersquadrat polygons to features for step calculation
            features.push({outer: outerLatLon, holes: holesLatLon});
          }
        });
      }
    });


    // --- STEP 1: Find übersquadrat first ---
    let overCoords = null;

    if (candidates.length>0){
      // Take largest found Übersquadrat candidate
      let maxArea=0;
      for (const c of candidates){
        const bounds = calculateBounds(c.coords);
        const area = (bounds.maxLat - bounds.minLat) * (bounds.maxLon - bounds.minLon);

        if(area>maxArea){
          maxArea=area;
          overCoords=c.coords;
        }
      }
    } else {
      // Fallback: largest polygon by area
      let maxArea=0;
      for (const f of features){
        const bounds = calculateBounds(f.outer);
        const area = (bounds.maxLat - bounds.minLat) * (bounds.maxLon - bounds.minLon);
        if(area>maxArea){
          maxArea=area;
          overCoords=f.outer;
        }
      }
    }

    if(!overCoords){ alert("Kein Übersquadrat gefunden."); return; }

    // --- STEP 2: Calculate grid steps from all non-ubersquadrat polygons ---
    if (features.length === 0) {
      alert('Keine Polygone im KML gefunden');
      return;
    }

    // Extract ubersquadrat polygon vertices - these define the grid
    const uberPolygon = candidates[0].coords;
    const allLats = [...new Set(uberPolygon.map(p => p[0]))].sort((a, b) => a - b);
    const allLons = [...new Set(uberPolygon.map(p => p[1]))].sort((a, b) => a - b);

    // Calculate grid steps from ubersquadrat size attribute
    const uberSize = candidates[0].size;
    console.log('Ubersquadrat size:', uberSize, 'x', uberSize, 'squadrats');

    // Calculate ubersquadrat bounds
    const uberBounds = calculateBounds(overCoords);
    const uberMinLat = uberBounds.minLat;
    const uberMaxLat = uberBounds.maxLat;
    const uberMinLon = uberBounds.minLon;
    const uberMaxLon = uberBounds.maxLon;

    // Calculate grid steps directly from ubersquadrat dimensions
    AppState.grid.latStep = (uberMaxLat - uberMinLat) / uberSize;
    AppState.grid.lonStep = (uberMaxLon - uberMinLon) / uberSize;

    console.log('Grid steps from ubersquadrat:', 'LAT=', AppState.grid.latStep.toFixed(7), 'LON=', AppState.grid.lonStep.toFixed(7));

    // Set grid origin to ubersquadrat SW corner - this defines the authoritative grid
    AppState.grid.originLat = uberMinLat;
    AppState.grid.originLon = uberMinLon;
    console.log('Grid origin (ubersquadrat SW corner):', AppState.grid.originLat.toFixed(7), AppState.grid.originLon.toFixed(7));

    // --- Build visited set using grid-based scanning ---
    AppState.visitedSet.clear();

    console.log('Starting grid-based scan of', allPolygons.length, 'polygons...');

    // Helper: Check if point is inside a ring using ray casting
    function isPointInRing(lat, lon, ring) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const latI = ring[i][0], lonI = ring[i][1];
        const latJ = ring[j][0], lonJ = ring[j][1];

        const intersect = ((lonI > lon) !== (lonJ > lon))
            && (lat < (latJ - latI) * (lon - lonI) / (lonJ - lonI) + latI);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    // Helper: Check if point is inside polygon with holes
    function isPointInPolygonWithHoles(lat, lon, polygon) {
      // Check if point is inside outer ring
      if (!isPointInRing(lat, lon, polygon.outer)) {
        return false;  // Not inside outer boundary
      }

      // Check if point is inside any hole (if so, it's NOT visited)
      for (const hole of polygon.holes) {
        if (isPointInRing(lat, lon, hole)) {
          return false;  // Point is in a hole = unvisited
        }
      }

      return true;  // Inside outer ring and not in any hole = visited
    }

    // Ubersquadrat grid indices - since origin is at ubersquadrat SW corner
    const uberMinI = 0;
    const uberMaxI = uberSize - 1;
    const uberMinJ = 0;
    const uberMaxJ = uberSize - 1;

    console.log('Ubersquadrat grid: i=[', uberMinI, 'to', uberMaxI, '], j=[', uberMinJ, 'to', uberMaxJ, ']');

    // Define scan area (extend beyond ubersquadrat)
    const scanMinI = uberMinI - CONFIG.SCAN_RADIUS_BUFFER;
    const scanMaxI = uberMaxI + CONFIG.SCAN_RADIUS_BUFFER;
    const scanMinJ = uberMinJ - CONFIG.SCAN_RADIUS_BUFFER;
    const scanMaxJ = uberMaxJ + CONFIG.SCAN_RADIUS_BUFFER;

    console.log('Scanning grid area: i=[', scanMinI, 'to', scanMaxI, '], j=[', scanMinJ, 'to', scanMaxJ, ']');

    // Scan each grid cell
    let gridCellsChecked = 0;
    let gridCellsMarked = 0;

    for (let i = scanMinI; i <= scanMaxI; i++) {
      for (let j = scanMinJ; j <= scanMaxJ; j++) {
        gridCellsChecked++;

        // Calculate grid cell center
        const cellCenterLat = AppState.grid.originLat + (i + 0.5) * AppState.grid.latStep;
        const cellCenterLon = AppState.grid.originLon + (j + 0.5) * AppState.grid.lonStep;

        // Check if this cell center is inside any polygon
        let foundInPolygon = false;

        for (const poly of allPolygons) {
          // Check if point is inside polygon (accounting for holes)
          if (isPointInPolygonWithHoles(cellCenterLat, cellCenterLon, poly)) {
            foundInPolygon = true;
            break;
          }
        }

        if (foundInPolygon) {
          AppState.visitedSet.add(`${i},${j}`);
          gridCellsMarked++;
        }
      }
    }

    console.log('Grid scan complete:', gridCellsChecked, 'cells checked,', gridCellsMarked, 'cells marked as visited');
    console.log('Visited set size:', AppState.visitedSet.size);

    // Use the same grid coordinates we calculated earlier for the visited set
    AppState.baseSquare = {minI: uberMinI, maxI: uberMaxI, minJ: uberMinJ, maxJ: uberMaxJ};
    console.log("Base square grid coords:", AppState.baseSquare);

    // Draw the blue rectangle using grid-aligned coordinates
    // This helps visualize whether our grid is correctly aligned
    const gridAlignedMinLat = AppState.grid.originLat + uberMinI * AppState.grid.latStep;
    const gridAlignedMaxLat = AppState.grid.originLat + (uberMaxI + 1) * AppState.grid.latStep;
    const gridAlignedMinLon = AppState.grid.originLon + uberMinJ * AppState.grid.lonStep;
    const gridAlignedMaxLon = AppState.grid.originLon + (uberMaxJ + 1) * AppState.grid.lonStep;

    console.log('Blue rectangle grid-aligned coords:',
      '[', gridAlignedMinLat.toFixed(6), ',', gridAlignedMinLon.toFixed(6), '] to',
      '[', gridAlignedMaxLat.toFixed(6), ',', gridAlignedMaxLon.toFixed(6), ']');
    console.log('vs actual ubersquadrat bounds:',
      '[', uberMinLat.toFixed(6), ',', uberMinLon.toFixed(6), '] to',
      '[', uberMaxLat.toFixed(6), ',', uberMaxLon.toFixed(6), ']');

    L.rectangle([[gridAlignedMinLat, gridAlignedMinLon],[gridAlignedMaxLat, gridAlignedMaxLon]], {color:'#0000ff',fillColor:'#0000ff',fillOpacity:0.15}).addTo(visitedLayer);

    // --- Draw grid lines ---
    gridLayer.clearLayers();

    // Calculate grid area to cover (extend beyond ubersquadrat)
    const gridMinI = uberMinI - CONFIG.GRID_DISPLAY_BUFFER;
    const gridMaxI = uberMaxI + CONFIG.GRID_DISPLAY_BUFFER;
    const gridMinJ = uberMinJ - CONFIG.GRID_DISPLAY_BUFFER;
    const gridMaxJ = uberMaxJ + CONFIG.GRID_DISPLAY_BUFFER;

    // Draw horizontal grid lines (constant latitude)
    for (let i = gridMinI; i <= gridMaxI + 1; i++) {
      const lat = AppState.grid.originLat + i * AppState.grid.latStep;
      const lonStart = AppState.grid.originLon + gridMinJ * AppState.grid.lonStep;
      const lonEnd = AppState.grid.originLon + (gridMaxJ + 1) * AppState.grid.lonStep;

      L.polyline([[lat, lonStart], [lat, lonEnd]], {
        color: CONFIG.GRID_LINE_COLOR,
        weight: 1,
        opacity: CONFIG.GRID_LINE_OPACITY
      }).addTo(gridLayer);
    }

    // Draw vertical grid lines (constant longitude)
    for (let j = gridMinJ; j <= gridMaxJ + 1; j++) {
      const lon = AppState.grid.originLon + j * AppState.grid.lonStep;
      const latStart = AppState.grid.originLat + gridMinI * AppState.grid.latStep;
      const latEnd = AppState.grid.originLat + (gridMaxI + 1) * AppState.grid.latStep;

      L.polyline([[latStart, lon], [latEnd, lon]], {
        color: CONFIG.GRID_VERTICAL_COLOR,
        weight: 1,
        opacity: CONFIG.GRID_VERTICAL_OPACITY
      }).addTo(gridLayer);
    }

    console.log('Grid drawn:', (gridMaxI - gridMinI + 2), 'horizontal lines,', (gridMaxJ - gridMinJ + 2), 'vertical lines');

    map.fitBounds([[uberMinLat, uberMinLon],[uberMaxLat, uberMaxLon]]);

    // Clear loading flag - KML is fully loaded and visitedSet is complete
    AppState.setLoading(false);
    console.log('KML loading complete, ready for optimization');
    } catch (error) {
      console.error('Error processing KML data:', error);
      AppState.setLoading(false);
      alert(`Fehler beim Verarbeiten der KML-Daten: ${error.message}`);
    }
  });

  layer.addTo(visitedLayer);
}

// ===== ROUTING HELPER FUNCTIONS =====

/**
 * Visualize calculated route on the map
 * @param {Object} routeData - Route data from router.js
 */
function visualizeRoute(routeData) {
  // Clear existing route visualization (keep start marker)
  const startMarker = [];
  routeLayer.eachLayer(layer => {
    if (layer instanceof L.CircleMarker) {
      startMarker.push(layer);
    }
  });
  routeLayer.clearLayers();
  startMarker.forEach(m => m.addTo(routeLayer));

  // Convert coordinates to Leaflet format [[lat, lon], ...]
  const latlngs = routeData.coordinates.map(coord => [coord.lat, coord.lon]);

  // Draw route polyline
  L.polyline(latlngs, {
    color: CONFIG.ROUTE_LINE_COLOR,
    weight: CONFIG.ROUTE_LINE_WEIGHT,
    opacity: CONFIG.ROUTE_LINE_OPACITY
  }).addTo(routeLayer);

  // Optionally add waypoint markers (small dots at each proposed square)
  if (routeData.waypoints && routeData.waypoints.length < 30) {
    routeData.waypoints.forEach((wp, index) => {
      // Skip start point (already has marker)
      if (index === 0) return;

      L.circleMarker([wp.lat, wp.lon], {
        radius: 3,
        fillColor: '#ffffff',
        color: CONFIG.ROUTE_LINE_COLOR,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(routeLayer);
    });
  }

  console.log('Route visualized on map');
}

/**
 * Update route statistics display in UI
 * @param {Object} routeData - Route data from router.js
 */
function updateRouteStatistics(routeData) {
  // Update distance
  document.getElementById(CONFIG.DOM_IDS.ROUTE_DISTANCE).textContent = routeData.distance.toFixed(1);

  // Update elevation gain
  document.getElementById(CONFIG.DOM_IDS.ROUTE_ELEVATION).textContent = routeData.elevationGain;

  // Update time
  document.getElementById(CONFIG.DOM_IDS.ROUTE_TIME).textContent = formatTime(routeData.time);

  // Show stats and export sections
  document.getElementById(CONFIG.DOM_IDS.ROUTE_STATS).style.display = 'block';
  document.getElementById(CONFIG.DOM_IDS.ROUTE_EXPORT).style.display = 'block';

  console.log('Route statistics updated in UI');
}

// ===== EVENT LISTENERS =====

// Optimize button
document.getElementById(CONFIG.DOM_IDS.OPTIMIZE_BTN).addEventListener('click',()=>{
  if(!AppState.isReady()){ alert('KML wird noch geladen, bitte warten...'); return; }
  if(!AppState.baseSquare){ alert('Noch kein Übersquadrat erkannt'); return; }
  const n=parseInt(document.getElementById(CONFIG.DOM_IDS.NUM_ADD).value);
  const dir=document.getElementById(CONFIG.DOM_IDS.DIRECTION).value;
  const mode=document.getElementById(CONFIG.DOM_IDS.OPTIMIZATION_MODE).value;
  const maxHole=parseInt(document.getElementById(CONFIG.DOM_IDS.MAX_HOLE_SIZE).value);
  const newRects=optimizeSquare(
    AppState.baseSquare, n, dir, AppState.visitedSet,
    AppState.grid.latStep, AppState.grid.lonStep,
    AppState.grid.originLat, AppState.grid.originLon,
    mode, maxHole
  );
  proposedLayer.clearLayers();
  newRects.forEach(r=>{
    L.rectangle(r,{color:'#ffd700',fillColor:'#ffd700',fillOpacity:0.3}).addTo(proposedLayer);
  });

  // Clear route when re-optimizing (new squares selected)
  AppState.resetRoute();
});

// Select start point button
document.getElementById(CONFIG.DOM_IDS.SELECT_START_BTN).addEventListener('click', () => {
  AppState.routing.selectingStartPoint = !AppState.routing.selectingStartPoint;
  const btn = document.getElementById(CONFIG.DOM_IDS.SELECT_START_BTN);

  if (AppState.routing.selectingStartPoint) {
    btn.textContent = '❌ Abbrechen';
    btn.style.background = '#ff6666';
    map.getContainer().style.cursor = 'crosshair';
  } else {
    btn.textContent = '📍 Startpunkt wählen';
    btn.style.background = '';
    map.getContainer().style.cursor = '';
  }
});

// Map click handler for start point selection
map.on('click', (e) => {
  if (AppState.routing.selectingStartPoint) {
    // Set start point
    AppState.routing.startPoint = { lat: e.latlng.lat, lon: e.latlng.lng };

    // Clear existing start marker
    routeLayer.clearLayers();

    // Add start point marker
    L.circleMarker([e.latlng.lat, e.latlng.lng], {
      radius: CONFIG.START_MARKER_RADIUS,
      fillColor: CONFIG.START_MARKER_COLOR,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(routeLayer);

    // Exit selection mode
    AppState.routing.selectingStartPoint = false;
    const btn = document.getElementById(CONFIG.DOM_IDS.SELECT_START_BTN);
    btn.textContent = '📍 Startpunkt wählen';
    btn.style.background = '';
    map.getContainer().style.cursor = '';

    // Update UI
    AppState.updateRouteUI();
  }
});

// Calculate route button
document.getElementById(CONFIG.DOM_IDS.CALCULATE_ROUTE_BTN).addEventListener('click', async () => {
  if (!AppState.routing.startPoint) {
    alert('Bitte zuerst einen Startpunkt wählen');
    return;
  }

  // Get routing parameters
  const bikeType = document.getElementById(CONFIG.DOM_IDS.BIKE_TYPE).value;
  const roundtrip = document.getElementById(CONFIG.DOM_IDS.ROUNDTRIP).checked;

  // Disable button during calculation
  const btn = document.getElementById(CONFIG.DOM_IDS.CALCULATE_ROUTE_BTN);
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Berechne Route...';

  try {
    console.log('Calculating route...');

    // Calculate route through proposed squares
    const routeData = await calculateRoute(
      proposedLayer,
      AppState.routing.startPoint,
      bikeType,
      roundtrip,
      CONFIG.BROUTER_API_URL
    );

    console.log('Route calculated:', routeData);

    // Store route data
    AppState.routing.currentRoute = routeData;
    AppState.routing.routeGeoJSON = routeData.rawGeoJSON;

    // Visualize route on map
    visualizeRoute(routeData);

    // Update statistics display
    updateRouteStatistics(routeData);

    // Show success message
    console.log(`Route: ${routeData.distance.toFixed(1)} km, ${routeData.elevationGain} m, ${routeData.time} min`);

    // Show warning if route was simplified
    if (routeData.simplified) {
      alert(`Hinweis: Die Route konnte nicht durch alle ${routeData.allSquares.length} Quadrate berechnet werden.\n\nStattdessen wurde eine vereinfachte Route durch ${routeData.waypoints.length} Wegpunkte erstellt.\n\nEinige Quadrate wurden übersprungen. Für vollständige Routen versuchen Sie es mit < 15 Quadraten.`);
    }

  } catch (error) {
    console.error('Route calculation error:', error);
    alert(`Fehler bei der Routenberechnung: ${error.message}`);
  } finally {
    // Re-enable button
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// Export GPX button
document.getElementById(CONFIG.DOM_IDS.EXPORT_GPX_BTN).addEventListener('click', () => {
  if (!AppState.routing.currentRoute) {
    alert('Keine Route zum Exportieren vorhanden');
    return;
  }

  try {
    const gpxContent = generateGPX(AppState.routing.currentRoute);
    downloadFile(gpxContent, 'squadrats-route.gpx', 'application/gpx+xml');
    console.log('GPX export successful');
  } catch (error) {
    console.error('GPX export error:', error);
    alert(`Fehler beim GPX-Export: ${error.message}`);
  }
});

// Export KML button
document.getElementById(CONFIG.DOM_IDS.EXPORT_KML_BTN).addEventListener('click', () => {
  if (!AppState.routing.currentRoute) {
    alert('Keine Route zum Exportieren vorhanden');
    return;
  }

  try {
    const kmlContent = generateKML(AppState.routing.currentRoute);
    downloadFile(kmlContent, 'squadrats-route.kml', 'application/vnd.google-earth.kml+xml');
    console.log('KML export successful');
  } catch (error) {
    console.error('KML export error:', error);
    alert(`Fehler beim KML-Export: ${error.message}`);
  }
});

// ===== EXPORT HELPER FUNCTIONS =====

/**
 * Generate GPX file content from route data
 * @param {Object} routeData - Route data
 * @returns {string} GPX XML content
 */
function generateGPX(routeData) {
  const timestamp = new Date().toISOString();

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Squadrats Navigator"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Squadrats Route</name>
    <desc>Bicycle route through proposed squares - ${routeData.distance.toFixed(1)} km, ${routeData.elevationGain} m elevation</desc>
    <time>${timestamp}</time>
  </metadata>
  <trk>
    <name>Squadrats Route</name>
    <type>Cycling</type>
    <trkseg>
`;

  // Add all track points
  routeData.coordinates.forEach(coord => {
    gpx += `      <trkpt lat="${coord.lat}" lon="${coord.lon}">
        <ele>${coord.elevation}</ele>
      </trkpt>\n`;
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  return gpx;
}

/**
 * Generate KML file content from route data
 * @param {Object} routeData - Route data
 * @returns {string} KML XML content
 */
function generateKML(routeData) {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Squadrats Route</name>
    <description>Bicycle route: ${routeData.distance.toFixed(1)} km, ${routeData.elevationGain} m elevation gain</description>
    <Style id="routeStyle">
      <LineStyle>
        <color>ff0066ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Squadrats Bicycle Route</name>
      <description>Distance: ${routeData.distance.toFixed(1)} km, Elevation: ${routeData.elevationGain} m, Time: ${formatTime(routeData.time)}</description>
      <styleUrl>#routeStyle</styleUrl>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`;

  // Add all coordinates (KML format: lon,lat,elevation)
  routeData.coordinates.forEach(coord => {
    kml += `          ${coord.lon},${coord.lat},${coord.elevation}\n`;
  });

  kml += `        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  return kml;
}

/**
 * Download file helper
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
