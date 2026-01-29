<script setup>
import { inject } from 'vue';
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
  { title: 'Löcher füllen', value: 'holes' }
];

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
    settings.value.maxHoleSize
  );

  store.setProposedSquares(result);
  emit('optimized', result);

}
</script>

<template>
  <div>
    <!-- Strategic Mode Controls -->
    <div>
      <!-- Number of squares slider -->
      <span class="text-caption">Neue Quadrate:</span>
      <v-slider
        v-model="settings.numSquares"
        :min="1"
        :max="30"
        :step="1"
        show-ticks
        thumb-label
        hide-details
        color="primary"
        class="ms-3"
      >
        <template #prepend>
          <span class="text-body-2 font-weight-bold">{{ settings.numSquares }}</span>
        </template>
      </v-slider>


      <!-- Max hole size slider -->
      <span class="text-caption mb-0">Maximale Lochgröße:</span>
      <v-slider
        v-model="settings.maxHoleSize"
        :min="1"
        :max="10"
        :step="1"
        show-ticks
        thumb-label
        hide-details
        color="primary"
        class="ms-3"
      >
        <template #prepend>
          <span class="text-body-2 font-weight-bold">{{ settings.maxHoleSize }}</span>
        </template>
      </v-slider>

         <!-- Optimization mode -->
      <v-select
        v-model="settings.mode"
        :items="optimizationModes"
        label="Optimierungs-Modus"
        density="compact"
        hide-details
        variant="outlined"
        class="mt-3"
      />
    </div>

    <!-- Optimize button -->
    <v-btn
      block
      size="large"
      color="primary"
      :disabled="!isReady || kmlLoading"
      :loading="kmlLoading"
      class="mt-3"
      @click="handleOptimize"
    >
      Optimieren
    </v-btn>
  </div>
</template>
