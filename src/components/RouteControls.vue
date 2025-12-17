<script setup>
import { ref, inject } from 'vue';
import { useAppStore } from '../stores/appStore';
import { storeToRefs } from 'pinia';
import { calculateRoute } from '../logic/router';
import { CONFIG } from '../logic/config';

const store = useAppStore();
const { routing, canCalculateRoute, startPointFormatted, proposedSquares, settings } = storeToRefs(store);
const mapRef = inject('mapRef');

const emit = defineEmits(['route-calculated']);

const calculating = ref(false);
const error = ref(null);

const bikeTypes = [
  { title: 'Standard', value: 'trekking' },
  { title: 'Gravel', value: 'gravel' },
  { title: 'Rennrad', value: 'fastbike' }
];

/**
 * Toggle start point selection mode
 */
function toggleSelectingPoint() {
  store.toggleSelectingStartPoint();
}

/**
 * Calculate route through proposed squares
 */
async function handleCalculateRoute() {
  if (!canCalculateRoute.value) return;

  calculating.value = true;
  error.value = null;

  try {
    // Get the proposed layer from the map
    const proposedLayer = mapRef.value?.getProposedLayer();
    if (!proposedLayer) {
      throw new Error('Keine vorgeschlagenen Quadrate vorhanden');
    }

    const routeData = await calculateRoute(
      proposedLayer,
      routing.value.startPoint,
      routing.value.bikeType,
      routing.value.roundtrip,
      CONFIG.BROUTER_API_URL
    );

    store.setCurrentRoute(routeData);
    emit('route-calculated', routeData);

    // Show warning if route was simplified
    if (routeData.simplified) {
      error.value = `Route vereinfacht: ${routeData.waypoints.length} von ${routeData.allSquares.length} Punkten`;
    }
  } catch (err) {
    console.error('Route calculation error:', err);
    error.value = err.message;
  } finally {
    calculating.value = false;
  }
}
</script>

<template>
  <div>
    <!-- Orienteering mode info -->
    <v-alert
      v-if="settings.optimizationApproach === 'orienteering'"
      type="info"
      density="compact"
      class="mb-3"
    >
      Quadrate wurden routing-optimiert ausgewählt
    </v-alert>

    <!-- Bike type selection -->
    <v-select
      v-model="routing.bikeType"
      :items="bikeTypes"
      label="Fahrrad-Typ"
      density="compact"
      hide-details
      variant="outlined"
    />

    <!-- Roundtrip checkbox -->
    <v-checkbox
      v-model="routing.roundtrip"
      label="Rundreise (Start = Ziel)"
      density="compact"
      hide-details
      class="mt-2"
    />

    <!-- Select start point button -->
    <v-btn
      block
      :color="routing.selectingStartPoint ? 'error' : 'secondary'"
      :variant="routing.selectingStartPoint ? 'flat' : 'outlined'"
      prepend-icon="mdi-map-marker"
      class="mt-3"
      @click="toggleSelectingPoint"
    >
      {{ routing.selectingStartPoint ? 'Abbrechen' : 'Startpunkt wahlen' }}
    </v-btn>

    <!-- Start point status -->
    <div class="text-caption mt-1" :class="startPointFormatted ? 'text-success' : 'text-grey'">
      {{ startPointFormatted ? `Startpunkt: ${startPointFormatted}` : 'Kein Startpunkt gewahlt' }}
    </div>

    <!-- Calculate route button -->
    <v-btn
      block
      color="success"
      :disabled="!canCalculateRoute || calculating"
      :loading="calculating"
      class="mt-3"
      @click="handleCalculateRoute"
    >
      Route berechnen
    </v-btn>

    <!-- Error/warning message -->
    <v-alert
      v-if="error"
      :type="error.includes('vereinfacht') ? 'warning' : 'error'"
      density="compact"
      class="mt-2"
      closable
      @click:close="error = null"
    >
      {{ error }}
    </v-alert>
  </div>
</template>
