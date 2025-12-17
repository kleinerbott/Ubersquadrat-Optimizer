<script setup>
import { inject, computed } from 'vue';
import { useAppStore } from '../stores/appStore';
import { storeToRefs } from 'pinia';
import { optimizeSquare } from '../logic/optimizer';

const store = useAppStore();
const { settings, isReady, baseSquare, visitedSet, grid, kmlLoading, routing } = storeToRefs(store);
const mapRef = inject('mapRef');

const emit = defineEmits(['optimized']);

const optimizationModes = [
  { title: 'Ausgewogen', value: 'balanced' },
  { title: 'Kantenabschluss', value: 'edge' },
  { title: 'Locher fullen', value: 'holes' }
];

// Computed property for mode toggle switch
const useOrienteering = computed({
  get: () => settings.value.optimizationApproach === 'orienteering',
  set: (val) => {
    settings.value.optimizationApproach = val ? 'orienteering' : 'strategic';
  }
});

/**
 * Run optimization and emit results
 */
function handleOptimize() {
  if (!isReady.value || !baseSquare.value) {
    return;
  }

  const result = optimizeSquare(
    baseSquare.value,
    settings.value.numSquares,
    settings.value.directions,
    visitedSet.value,
    grid.value.latStep,
    grid.value.lonStep,
    grid.value.originLat,
    grid.value.originLon,
    settings.value.mode,
    settings.value.maxHoleSize,
    settings.value.optimizationApproach,    // NEW: strategic or orienteering
    settings.value.maxDistance,             // NEW: km budget
    settings.value.routingWeight,           // NEW: route priority
    routing.value.startPoint                // NEW: user-selected start point
  );

  store.setProposedSquares(result);
  emit('optimized', result);
}
</script>

<template>
  <div>
    <!-- Mode Selection Toggle -->
    <v-switch
      v-model="useOrienteering"
      label="Routing-optimierte Auswahl"
      color="success"
      hide-details
      class="mb-3"
    />

    <!-- Strategic Mode Controls -->
    <div v-if="!useOrienteering">
      <!-- Number of squares slider -->
      <v-slider
        v-model="settings.numSquares"
        :min="1"
        :max="20"
        :step="1"
        thumb-label
        hide-details
        color="primary"
      >
        <template #prepend>
          <span class="text-caption">Neue Quadrate</span>
        </template>
        <template #append>
          <span class="text-body-2 font-weight-bold">{{ settings.numSquares }}</span>
        </template>
      </v-slider>

      <!-- Optimization mode -->
      <v-select
        v-model="settings.mode"
        :items="optimizationModes"
        label="Modus"
        density="compact"
        hide-details
        variant="outlined"
        class="mt-3"
      />

      <!-- Max hole size slider -->
      <v-slider
        v-model="settings.maxHoleSize"
        :min="1"
        :max="10"
        :step="1"
        thumb-label
        hide-details
        color="primary"
        class="mt-3"
      >
        <template #prepend>
          <span class="text-caption">Max. Lochgröße</span>
        </template>
        <template #append>
          <span class="text-body-2 font-weight-bold">{{ settings.maxHoleSize }}</span>
        </template>
      </v-slider>
    </div>

    <!-- Orienteering Mode Controls -->
    <div v-else>
      <!-- Max Distance slider -->
      <v-slider
        v-model="settings.maxDistance"
        :min="20"
        :max="100"
        :step="5"
        thumb-label
        hide-details
        color="success"
      >
        <template #prepend>
          <span class="text-caption">Max. Distanz</span>
        </template>
        <template #append>
          <span class="text-body-2 font-weight-bold">{{ settings.maxDistance }} km</span>
        </template>
      </v-slider>

      <!-- Routing Weight slider -->
      <v-slider
        v-model="settings.routingWeight"
        :min="0.5"
        :max="2.0"
        :step="0.1"
        thumb-label
        hide-details
        color="success"
        class="mt-3"
      >
        <template #prepend>
          <span class="text-caption">Routing-Priorität</span>
        </template>
        <template #append>
          <span class="text-body-2 font-weight-bold">{{ settings.routingWeight.toFixed(1) }}</span>
        </template>
      </v-slider>

      <!-- Helper text for routing weight -->
      <div class="text-caption text-grey mt-1">
        {{
          settings.routingWeight < 0.9
            ? 'Mehr strategisch'
            : settings.routingWeight > 1.1
            ? 'Mehr Routing'
            : 'Ausgewogen'
        }}
      </div>

      <!-- Optimization mode (still applies) -->
      <v-select
        v-model="settings.mode"
        :items="optimizationModes"
        label="Strategischer Modus"
        density="compact"
        hide-details
        variant="outlined"
        class="mt-2"
      />
    </div>

    <!-- Optimize button -->
    <v-btn
      block
      color="primary"
      :disabled="!isReady || kmlLoading"
      :loading="kmlLoading"
      class="mt-3"
      @click="handleOptimize"
    >
      {{ useOrienteering ? 'Route optimieren' : 'Optimieren' }}
    </v-btn>
  </div>
</template>
