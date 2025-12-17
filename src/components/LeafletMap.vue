<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import L from 'leaflet';
import { useAppStore } from '../stores/appStore';
import { storeToRefs } from 'pinia';
import { CONFIG } from '../logic/config';
import { visualizeUbersquadrat, drawGridLines } from '../logic/grid';

const store = useAppStore();
const { routing } = storeToRefs(store);

// Template refs
const mapContainer = ref(null);

// Leaflet map and layers
let map = null;
const layers = {
  visited: null,
  proposed: null,
  grid: null,
  route: null
};

onMounted(() => {
  initializeMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

/**
 * Initialize Leaflet map
 */
function initializeMap() {
  map = L.map(mapContainer.value).setView([51.7, 8.3], 10);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  // Create layer groups
  layers.visited = L.layerGroup().addTo(map);
  layers.proposed = L.layerGroup().addTo(map);
  layers.grid = L.layerGroup().addTo(map);
  layers.route = L.layerGroup().addTo(map);

  // Handle map clicks for start point selection
  map.on('click', handleMapClick);
}

/**
 * Handle map click for start point selection
 */
function handleMapClick(e) {
  if (routing.value.selectingStartPoint) {
    store.setStartPoint(e.latlng.lat, e.latlng.lng);

    // Clear existing route layer but keep start marker
    layers.route.clearLayers();

    // Add start point marker
    L.circleMarker([e.latlng.lat, e.latlng.lng], {
      radius: CONFIG.START_MARKER_RADIUS,
      fillColor: CONFIG.START_MARKER_COLOR,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(layers.route);
  }
}

// Watch for cursor changes when selecting start point
watch(
  () => routing.value.selectingStartPoint,
  (selecting) => {
    if (map) {
      map.getContainer().style.cursor = selecting ? 'crosshair' : '';
    }
  }
);

/**
 * Called when KML is loaded - visualize ubersquadrat and grid
 */
function onKmlLoaded(data) {
  const { gridParams, bounds, kmlLayer } = data;

  // Clear existing layers
  layers.visited.clearLayers();
  layers.proposed.clearLayers();
  layers.grid.clearLayers();
  layers.route.clearLayers();

  // Add the KML layer with visited polygons
  if (kmlLayer) {
    kmlLayer.addTo(layers.visited);
  }

  // Visualize ubersquadrat (blue rectangle)
  visualizeUbersquadrat(gridParams.baseSquare, gridParams, layers.visited);

  // Draw grid lines
  drawGridLines(gridParams.baseSquare, gridParams, layers.grid);

  // Fit map to ubersquadrat bounds
  map.fitBounds([
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon]
  ]);
}

/**
 * Show proposed squares on map
 */
function showProposedSquares(squares) {
  layers.proposed.clearLayers();

  squares.forEach(rectangle => {
    L.rectangle(rectangle, {
      color: CONFIG.PROPOSED_COLOR,
      fillColor: CONFIG.PROPOSED_COLOR,
      fillOpacity: CONFIG.PROPOSED_OPACITY
    }).addTo(layers.proposed);
  });
}

/**
 * Show calculated route on map
 */
function showRoute(routeData) {
  // Keep ONLY the start marker (larger radius), clear everything else
  let startMarker = null;
  layers.route.eachLayer(layer => {
    if (layer instanceof L.CircleMarker && layer.options.radius === CONFIG.START_MARKER_RADIUS) {
      startMarker = layer;
    }
  });

  layers.route.clearLayers();

  if (startMarker) {
    startMarker.addTo(layers.route);
  }

  // Draw route polyline
  const latlngs = routeData.coordinates.map(coord => [coord.lat, coord.lon]);
  L.polyline(latlngs, {
    color: CONFIG.ROUTE_LINE_COLOR,
    weight: CONFIG.ROUTE_LINE_WEIGHT,
    opacity: CONFIG.ROUTE_LINE_OPACITY
  }).addTo(layers.route);

  // Add waypoint markers if not too many
  // These are road-aware waypoints from waypoint-optimizer.js
  if (routeData.waypoints && routeData.waypoints.length < CONFIG.MAX_WAYPOINT_MARKERS) {
    routeData.waypoints.forEach((wp, index) => {
      if (index === 0) return; // Skip start point (already shown)

      L.circleMarker([wp.lat, wp.lon], {
        radius: 3,
        fillColor: '#ffffff',
        color: CONFIG.ROUTE_LINE_COLOR,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(layers.route);
    });
  }

  console.log(`Map: Displayed route with ${routeData.waypoints?.length || 0} waypoints`);
}

/**
 * Get the proposed layer for route calculation
 */
function getProposedLayer() {
  return layers.proposed;
}

/**
 * Clear route layer
 */
function clearRoute() {
  layers.route.clearLayers();
}

// Expose methods to parent component
defineExpose({
  onKmlLoaded,
  showProposedSquares,
  showRoute,
  getProposedLayer,
  clearRoute
});
</script>

<template>
  <div ref="mapContainer" class="leaflet-map"></div>
</template>

<style scoped>
.leaflet-map {
  flex: 1;
  height: 100%;
  z-index: 0;
}
</style>
