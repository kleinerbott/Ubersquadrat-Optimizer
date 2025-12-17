/**
 * Pinia Store - Central Application State
 * Replaces the old AppState object with reactive Vue state management
 */

import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
  state: () => ({
    // Grid parameters (calculated from ubersquadrat)
    grid: {
      latStep: null,
      lonStep: null,
      originLat: null,
      originLon: null
    },

    // Core state
    visitedSet: new Set(),
    baseSquare: null,
    kmlLoading: false,
    kmlFilename: null,

    // Proposed squares (results from optimizer)
    proposedSquares: [],

    // Routing state
    routing: {
      startPoint: null,
      selectingStartPoint: false,
      currentRoute: null,
      bikeType: 'trekking',
      roundtrip: false
    },

    // Optimization settings
    settings: {
      // Strategic mode settings
      numSquares: 5,
      directions: ['N', 'S', 'E', 'W'],
      mode: 'balanced',
      maxHoleSize: 3,

      // Optimization approach selector
      optimizationApproach: 'strategic', // 'strategic' or 'orienteering'

      // Orienteering mode settings
      maxDistance: 50,      // km (20-100)
      routingWeight: 1.0    // 0.5-2.0 (route priority)
    }
  }),

  getters: {
    /**
     * Check if app is ready for optimization (KML loaded, not currently loading)
     */
    isReady: (state) => state.grid.latStep !== null && !state.kmlLoading,

    /**
     * Check if route calculation is possible (start point selected)
     */
    canCalculateRoute: (state) => state.routing.startPoint !== null && state.proposedSquares.length > 0,

    /**
     * Check if all directions are selected
     */
    allDirectionsSelected: (state) => state.settings.directions.length === 4,

    /**
     * Format start point as string for display
     */
    startPointFormatted: (state) => {
      const sp = state.routing.startPoint;
      return sp ? `${sp.lat.toFixed(5)}, ${sp.lon.toFixed(5)}` : null;
    },

    /**
     * Get ubersquadrat size as string (e.g., "16x16")
     */
    ubersquadratSize: (state) => {
      if (!state.baseSquare) return null;
      const rows = state.baseSquare.maxI - state.baseSquare.minI + 1;
      const cols = state.baseSquare.maxJ - state.baseSquare.minJ + 1;
      return `${rows}x${cols}`;
    }
  },

  actions: {
    resetState() {
      this.visitedSet = new Set();
      this.baseSquare = null;
      this.proposedSquares = [];
      this.grid = { latStep: null, lonStep: null, originLat: null, originLon: null };
      this.clearStartPoint();
      this.resetRoute();
    },

    resetRoute() {
      // Don't clear startPoint - user may want to keep it for multiple optimizations
      // Only clear the calculated route
      this.routing.selectingStartPoint = false;
      this.routing.currentRoute = null;
    },

    clearStartPoint() {
      this.routing.startPoint = null;
      this.routing.selectingStartPoint = false;
    },

    setStartPoint(lat, lon) {
      this.routing.startPoint = { lat, lon };
      this.routing.selectingStartPoint = false;
    },

    toggleSelectingStartPoint() {
      this.routing.selectingStartPoint = !this.routing.selectingStartPoint;
    },

    toggleDirection(dir) {
      const dirs = this.settings.directions;
      if (dirs.includes(dir)) {
        if (dirs.length > 1) {
          this.settings.directions = dirs.filter(d => d !== dir);
        }
      } else {
        this.settings.directions = [...dirs, dir];
      }
    },

    selectAllDirections() {
      this.settings.directions = ['N', 'S', 'E', 'W'];
    },

    setLoading(loading) {
      this.kmlLoading = loading;
    },

    setGridParameters(params) {
      this.grid.latStep = params.latStep;
      this.grid.lonStep = params.lonStep;
      this.grid.originLat = params.originLat;
      this.grid.originLon = params.originLon;
      this.baseSquare = params.baseSquare;
    },

    setVisitedSet(visitedSet) {
      this.visitedSet = visitedSet;
    },

    setProposedSquares(squares) {
      this.proposedSquares = squares;
      this.resetRoute();
    },

    setCurrentRoute(routeData) {
      this.routing.currentRoute = routeData;
    },

    setKmlFilename(filename) {
      this.kmlFilename = filename;
    }
  }
});
