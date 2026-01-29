<script setup>
import { computed } from 'vue';

const props = defineProps({
  route: {
    type: Object,
    required: true
  }
});

const formattedTime = computed(() => {
  const minutes = props.route.time;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
});
</script>

<template>
  <v-card variant="tonal" density="compact">
    <v-card-text class="pa-3">
      <div class="d-flex justify-space-between align-center mb-1">
        <span class="text-caption">Distanz</span>
        <span class="text-body-2 font-weight-bold">{{ route.distance.toFixed(1) }} km</span>
      </div>
      <div class="d-flex justify-space-between align-center mb-1">
        <span class="text-caption">Höhengewinn</span>
        <span class="text-body-2 font-weight-bold">
          <v-icon size="small" color="success">mdi-arrow-up</v-icon>
          {{ route.elevationGain }} m
        </span>
      </div>
      <div class="d-flex justify-space-between align-center">
        <span class="text-caption">Zeit</span>
        <span class="text-body-2 font-weight-bold">
          <v-icon size="small">mdi-clock-outline</v-icon>
          {{ formattedTime }}
        </span>
      </div>
      <div v-if="route.profileUsed" class="text-caption text-grey mt-2">
        Profil: {{ route.profileUsed }}
      </div>
    </v-card-text>
  </v-card>
</template>
