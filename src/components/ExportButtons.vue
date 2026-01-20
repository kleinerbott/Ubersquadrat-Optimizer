<script setup>
import { ref } from 'vue';
import { generateGPX, generateKML, downloadFile } from '../logic/export';
import performanceLogger from '../logic/performance-logger';
import { useAppStore } from '../stores/appStore';
import { storeToRefs } from 'pinia';

const store = useAppStore();
const { routing } = storeToRefs(store);

const props = defineProps({
  route: {
    type: Object,
    required: true
  }
});

const error = ref(null);

/**
 * Export route as GPX file
 */
function exportGpx() {
  try {
    const content = generateGPX(props.route);
    downloadFile(content, 'squadrats-route.gpx', 'application/gpx+xml');
  } catch (err) {
    console.error('GPX export error:', err);
    error.value = err.message;
  }
}

/**
 * Export route as KML file
 */
function exportKml() {
  try {
    const content = generateKML(props.route);
    downloadFile(content, 'squadrats-route.kml', 'application/vnd.google-earth.kml+xml');
  } catch (err) {
    console.error('KML export error:', err);
    error.value = err.message;
  }
}

/**
 * Export performance metrics as JSON file
 */
function exportPerformanceMetrics() {
  try {
    const jsonData = performanceLogger.exportJSON();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `performance-metrics-${timestamp}.json`;
    downloadFile(jsonData, filename, 'application/json');
  } catch (err) {
    console.error('Performance export error:', err);
    error.value = err.message;
  }
}

/**
 * Open route in BikeRouter web interface for editing
 */
function openInBikeRouter() {
  try {
    if (!props.route || !props.route.waypoints || props.route.waypoints.length < 2) {
      error.value = 'No waypoints available';
      return;
    }

    // Get waypoints (lon,lat format for BikeRouter, separated by semicolons)
    const lonlats = props.route.waypoints
      .map(wp => `${wp.lon.toFixed(6)},${wp.lat.toFixed(6)}`)
      .join(';');

    // Get center point for map (use middle of route)
    const midIndex = Math.floor(props.route.waypoints.length / 2);
    const centerLat = props.route.waypoints[midIndex].lat;
    const centerLon = props.route.waypoints[midIndex].lon;
    const zoom = 12;

    // Map bike type to BikeRouter profile
    const profileMap = {
      trekking: 'trekking',
      gravel: 'gravel',
      fastbike: 'fastbike'
    };
    const profile = profileMap[routing.value.bikeType] || 'trekking';

    // Build BikeRouter web URL
    const url = `https://bikerouter.de/#map=${zoom}/${centerLat.toFixed(5)}/${centerLon.toFixed(5)}/standard&lonlats=${lonlats}&profile=${profile}`;

    // Open in new tab
    window.open(url, '_blank');
  } catch (err) {
    console.error('BikeRouter link error:', err);
    error.value = err.message;
  }
}
</script>

<template>
  <div>
    <div class="d-flex gap-2">
      <v-btn
        flex="1"
        variant="outlined"
        prepend-icon="mdi-download"
        size="small"
        @click="exportGpx"
      >
        GPX
      </v-btn>
      <v-btn
        flex="1"
        variant="outlined"
        prepend-icon="mdi-download"
        size="small"
        @click="exportKml"
      >
        KML
      </v-btn>
    </div>

    <v-btn
      block
      variant="outlined"
      prepend-icon="mdi-open-in-new"
      size="small"
      class="mt-2"
      color="primary"
      @click="openInBikeRouter"
    >
      In BikeRouter bearbeiten
    </v-btn>

    <v-divider class="my-3" />

    <v-btn
      block
      variant="outlined"
      prepend-icon="mdi-chart-timeline-variant"
      size="small"
      color="secondary"
      @click="exportPerformanceMetrics"
    >
      Performance-Metriken exportieren
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

<style scoped>
.gap-2 {
  gap: 8px;
}
</style>
