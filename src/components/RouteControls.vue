<script setup>
import { ref, inject, computed } from 'vue';
import { useAppStore } from '../stores/appStore';
import { storeToRefs } from 'pinia';
import { calculateRoute } from '../logic/router';
import { CONFIG } from '../logic/config';

const store = useAppStore();
const { routing, canCalculateRoute, startPointFormatted, isReady, kmlLoading } = storeToRefs(store);
const mapRef = inject('mapRef');

const emit = defineEmits(['route-calculated', 'route-calculation-started']);

const calculating = ref(false);
const error = ref(null);
const statusMessage = ref(null);

const bikeTypes = [
  { title: 'Standard', value: 'trekking' },
  { title: 'Mountainbike', value: 'hiking-mountain' },
  { title: 'Rennrad', value: 'fastbike' }
];


function toggleSelectingPoint() {
  store.toggleSelectingStartPoint();
}


async function handleCalculateRoute() {
  if (!canCalculateRoute.value) return;

  calculating.value = true;
  error.value = null;
  statusMessage.value = 'Starte Routenberechnung...';

  emit('route-calculation-started');

  try {
    const proposedLayer = mapRef.value?.getProposedLayer();
    if (!proposedLayer) {
      throw new Error('Keine vorgeschlagenen Quadrate vorhanden');
    }

    const proposedMetadata = store.proposedMetadata;

    const onProgress = (message) => {
      statusMessage.value = message;
    };

    const routeData = await calculateRoute(
      proposedLayer,
      routing.value.startPoint,
      routing.value.bikeType,
      routing.value.roundtrip,
      CONFIG.BROUTER_API_URL,
      proposedMetadata,  
      onProgress         
    );

    store.setCurrentRoute(routeData);
    emit('route-calculated', routeData);

    statusMessage.value = null;

    // Show warning if squares were skipped due to missing roads
    if (routeData.skippedSquareCoords && routeData.skippedSquareCoords.length > 0) {
      const count = routeData.skippedSquareCoords.length;
      const bikeTypeLabel = bikeTypes.find(b => b.value === routing.value.bikeType)?.title || routing.value.bikeType;
      error.value = `${count} Quadrat(e) übersprungen (keine geeigneten Straßen für ${bikeTypeLabel}). Versuche einen anderen Routing-Typ.`;
    }
    else if (routeData.simplified) {
      error.value = `Route vereinfacht: ${routeData.waypoints.length} von ${routeData.allSquares.length} Punkten`;
    }
  } catch (err) {
    console.error('Route calculation error:', err);
    statusMessage.value = null;
    error.value = err.message;
  } finally {
    calculating.value = false;
  }
}
</script>

<template>
  <div>
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
      size="large"
      :color="routing.selectingStartPoint ? 'error' : 'secondary'"
      :variant="routing.selectingStartPoint ? 'flat' : 'outlined'"
      :disabled="!isReady || kmlLoading"
      prepend-icon="mdi-map-marker"
      class="mt-3"
      @click="toggleSelectingPoint"
    >
      {{ routing.selectingStartPoint ? 'Abbrechen' : 'Startpunkt wählen' }}
    </v-btn>

    <!-- Start point status -->
    <div class="text-caption mt-1" :class="startPointFormatted ? 'text-success' : 'text-grey'">
      {{ startPointFormatted ? `Startpunkt: ${startPointFormatted}` : 'Kein Startpunkt gewählt' }}
    </div>

    <!-- Calculate route button -->
    <v-btn
      block
      size="large"
      color="success"
      :disabled="!canCalculateRoute || calculating"
      :loading="calculating"
      class="mt-3"
      @click="handleCalculateRoute"
    >
      Route berechnen
    </v-btn>

    <!-- Status message during calculation -->
    <v-alert
      v-if="statusMessage"
      type="info"
      density="compact"
      class="mt-2"
    >
      {{ statusMessage }}
    </v-alert>

    <!-- Error/warning message -->
    <v-alert
      v-if="error"
      :type="error.includes('vereinfacht') || error.includes('übersprungen') ? 'warning' : 'error'"
      density="compact"
      class="mt-2"
      closable
      @click:close="error = null"
    >
      {{ error }}
    </v-alert>
  </div>
</template>
