<script setup>
import { ref, onMounted } from 'vue';
import { useAppStore } from '../stores/appStore';
import { loadKmlFile, loadCachedKml } from '../logic/file-loader';
import { parseKmlFeatures, findUbersquadrat } from '../logic/kml-processor';
import { calculateGridParameters, scanAndBuildVisitedSet } from '../logic/grid';
import L from 'leaflet';
import { kml } from '@mapbox/togeojson';

const store = useAppStore();
const emit = defineEmits(['kml-loaded']);

const loading = ref(false);
const error = ref(null);

onMounted(async () => {
  // Try to load cached KML on startup
  const cached = loadCachedKml();
  if (cached) {
    console.log(`Auto-loading cached KML: ${cached.filename}`);
    try {
      await processKmlContent(cached.content, cached.filename);
    } catch (err) {
      console.error('Error auto-loading cached KML:', err);
      error.value = `Cached KML load failed: ${err.message}`;
      // Reset loading state if stuck
      store.setLoading(false);
    }
  }
});

/**
 * Handle file picker button click
 */
async function handleLoadClick() {
  loading.value = true;
  error.value = null;

  try {
    const { filename, content } = await loadKmlFile();
    await processKmlContent(content, filename);
  } catch (err) {
    console.error('File loading error:', err);
    if (err.message !== 'File selection cancelled') {
      error.value = err.message;
    }
  } finally {
    loading.value = false;
  }
}

/**
 * Process KML content and update store
 */
async function processKmlContent(kmlContent, filename) {
  store.setLoading(true);
  store.resetState();

  try {
    // Parse KML string to DOM
    const parser = new DOMParser();
    const kmlDom = parser.parseFromString(kmlContent, 'text/xml');

    // Check for parsing errors
    const parserError = kmlDom.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid KML file format');
    }

    // Convert KML to GeoJSON
    const geojson = kml(kmlDom);

    // Create Leaflet layer from GeoJSON
    const layer = L.geoJSON(geojson);

    // Parse KML features
    const { features, allPolygons, candidates } = parseKmlFeatures(layer);

    // Find ubersquadrat
    const ubersquadrat = findUbersquadrat(candidates, features);
    if (!ubersquadrat.coords) {
      throw new Error('Kein Ubersquadrat gefunden');
    }

    // Calculate grid parameters
    const gridParams = calculateGridParameters(ubersquadrat.coords, ubersquadrat.size);

    // Build visited set
    const visitedSet = scanAndBuildVisitedSet(allPolygons, gridParams.baseSquare, gridParams);

    // Update store
    store.setGridParameters(gridParams);
    store.setVisitedSet(visitedSet);
    store.setKmlFilename(filename);

    // Emit event for map update (include the layer for visualization)
    emit('kml-loaded', {
      gridParams,
      bounds: gridParams.bounds,
      kmlLayer: layer
    });

    console.log('KML loading complete');
  } catch (err) {
    console.error('Error processing KML:', err);
    error.value = err.message;
    throw err; // Re-throw to be caught by onMounted
  } finally {
    store.setLoading(false);
  }
}
</script>

<template>
  <div>
    <v-btn
      block
      color="primary"
      :loading="loading"
      prepend-icon="mdi-folder-open"
      @click="handleLoadClick"
    >
      {{ store.kmlFilename ? 'Andere KML laden' : 'KML-Datei laden' }}
    </v-btn>

    <v-alert
      v-if="error"
      type="error"
      density="compact"
      class="mt-2"
      closable
      @click:close="error = null"
    >
      {{ error }}
    </v-alert>
  </div>
</template>
