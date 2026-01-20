/**
 * Router Module - BRouter Integration for Bicycle Routing
 *
 * Handles route calculation through proposed squares using BRouter API,
 * TSP optimization, and road-aware waypoint selection.
 */

import * as turf from '@turf/turf';
import { solveTSP, calculateRouteDistance } from './tsp-solver.js';
import { fetchRoadsInArea } from './road-fetcher.js';
import { optimizeWaypoints, optimizeWaypointsWithSequence, calculateCombinedBounds } from './waypoint-optimizer.js';
import { tryProfilesWithFallback } from './routing-strategies.js';
import { pointsMatch } from './bounds-utils.js';
import { callBRouterAPI, parseBRouterResponse } from './brouter-api.js';
import performanceLogger from './performance-logger.js';

// Re-export BRouter API functions for backward compatibility
export { callBRouterAPI, parseBRouterResponse };

/**
 * Group squares by cardinal direction to create smaller Overpass queries
 * This avoids loading roads for the entire area including the Übersquadrat
 *
 * @param {Array} squares - Array of square objects with bounds
 * @returns {Array} Array of {direction: string, squares: Array} groups
 */
function groupSquaresByDirection(squares) {
  if (squares.length === 0) return [];
  if (squares.length === 1) return [{ direction: 'Single', squares }];

  // Calculate overall center point of all squares
  const avgLat = squares.reduce((sum, s) => sum + s.lat, 0) / squares.length;
  const avgLon = squares.reduce((sum, s) => sum + s.lon, 0) / squares.length;

  // Classify each square by direction relative to center
  const north = [];
  const south = [];
  const east = [];
  const west = [];

  for (const square of squares) {
    const latDiff = square.lat - avgLat;
    const lonDiff = square.lon - avgLon;

    // Determine primary direction (larger difference)
    if (Math.abs(latDiff) > Math.abs(lonDiff)) {
      // North-South dominant
      if (latDiff > 0) {
        north.push(square);
      } else {
        south.push(square);
      }
    } else {
      // East-West dominant
      if (lonDiff > 0) {
        east.push(square);
      } else {
        west.push(square);
      }
    }
  }

  // Build result array (only include non-empty groups)
  const groups = [];
  if (north.length > 0) groups.push({ direction: 'North', squares: north });
  if (south.length > 0) groups.push({ direction: 'South', squares: south });
  if (east.length > 0) groups.push({ direction: 'East', squares: east });
  if (west.length > 0) groups.push({ direction: 'West', squares: west });

  return groups;
}

/**
 * Extract proposed squares from Leaflet layer
 * Returns center points of all rectangles in the layer
 *
 * @param {L.LayerGroup} proposedLayer - Leaflet layer with proposed squares
 * @param {Array} proposedMetadata - Optional metadata with grid coordinates
 * @returns {Array} Array of {lat, lon, bounds, gridCoords} objects
 */
export function extractProposedSquares(proposedLayer, proposedMetadata = []) {
  const squares = [];

  proposedLayer.eachLayer((layer, index) => {
    if (layer.getBounds) {
      const bounds = layer.getBounds();
      const center = bounds.getCenter();

      // Get grid coordinates from metadata if available
      const meta = proposedMetadata[squares.length]; // Use current length as index
      const gridCoords = meta?.gridCoords;

      squares.push({
        lat: center.lat,
        lon: center.lng,
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        },
        gridCoords: gridCoords // Add grid coordinates for unique identification
      });
    }
  });

  return squares;
}


/**
 * Main function: Calculate optimal route through proposed squares
 *
 * @param {L.LayerGroup} proposedLayer - Layer with proposed squares
 * @param {Object} startPoint - Starting point {lat, lon}
 * @param {string} bikeType - Bike profile (trekking, gravel, fastbike)
 * @param {boolean} roundtrip - Whether to return to start
 * @param {string} apiUrl - BRouter API URL
 * @param {Array} proposedMetadata - Optional metadata with grid coordinates
 * @returns {Promise<Object>} Route data
 */
export async function calculateRoute(proposedLayer, startPoint, bikeType, roundtrip, apiUrl = 'https://brouter.de/brouter', proposedMetadata = []) {
  // Step 1: Extract proposed squares with bounds and grid coordinates
  const squares = extractProposedSquares(proposedLayer, proposedMetadata);

  if (squares.length === 0) {
    throw new Error('Keine vorgeschlagenen Quadrate zum Routen vorhanden');
  }

  // ════════════════════════════════════════════════════════════════
  // OPTION C: Two-Phase Approach for Optimal Route
  // ════════════════════════════════════════════════════════════════
  // Phase 1: Find optimal visit order using rough waypoints
  // Phase 2: Optimize waypoints for that specific order
  // ════════════════════════════════════════════════════════════════

  let finalWaypoints;
  let roadFetchFailed = false;

  try {
    // Group squares by cardinal direction to avoid loading roads in the center (Übersquadrat)
    performanceLogger.time('  ↳ Straßen laden (Overpass API)');
    const squareGroups = groupSquaresByDirection(squares);

    // Fetch roads for each direction in parallel
    const roadPromises = squareGroups.map(async (group, idx) => {
      const groupBounds = calculateCombinedBounds(group.squares.map(s => s.bounds));
      try {
        const roads = await fetchRoadsInArea(groupBounds, bikeType);
        return roads;
      } catch (error) {
        console.warn(`[Router] Failed to fetch roads for ${group.direction}: ${error.message}`);
        return [];
      }
    });

    const roadArrays = await Promise.all(roadPromises);

    // Merge and deduplicate roads by ID
    const roadMap = new Map();
    for (const roadArray of roadArrays) {
      for (const road of roadArray) {
        const id = road.properties?.id;
        if (id && !roadMap.has(id)) {
          roadMap.set(id, road);
        } else if (!id) {
          // Roads without ID - add them anyway
          roadMap.set(Math.random(), road);
        }
      }
    }
    const roads = Array.from(roadMap.values());

    performanceLogger.timeEnd('  ↳ Straßen laden (Overpass API)');

    if (roads.length > 0) {
      // ────────────────────────────────────────────────────────────
      // PHASE 1: Find optimal visit order
      // ────────────────────────────────────────────────────────────
      performanceLogger.time('  ↳ Phase 1: Besuchsreihenfolge (TSP)');

      // Optimize waypoints WITHOUT sequence (neutral, just find roads)
      const roughOptimization = optimizeWaypoints(squares, roads);
      const roughWaypoints = roughOptimization.waypoints;

      // Solve TSP with these rough waypoints to get FINAL visit order
      const roughWaypointCoords = roughWaypoints.map(wp => ({ lat: wp.lat, lon: wp.lon }));
      const tspResult = solveTSP(roughWaypointCoords, startPoint, roundtrip);

      performanceLogger.timeEnd('  ↳ Phase 1: Besuchsreihenfolge (TSP)');

      // ────────────────────────────────────────────────────────────
      // PHASE 2: Optimize waypoints for this specific order
      // ────────────────────────────────────────────────────────────
      performanceLogger.time('  ↳ Phase 2: Wegpunktoptimierung');

      // Extract squares only from TSP route (remove startPoint)
      let routeSquaresOnly = tspResult.route.filter((waypoint, idx) => {
        // Skip first point (always startPoint)
        if (idx === 0) return false;
        // Skip last point if roundtrip (also startPoint)
        if (roundtrip && idx === tspResult.route.length - 1) return false;
        return true;
      });

      // Map TSP waypoints back to original squares with bounds
      const orderedSquares = routeSquaresOnly.map((waypoint, idx) => {
        // Find the original square that matches this waypoint
        const matchingSquare = squares.find(s => {
          // Match by finding the rough waypoint using pointsMatch utility
          const roughWp = roughWaypoints.find(rw => pointsMatch(rw, waypoint));
          if (!roughWp) return false;

          // Match rough waypoint back to square
          return roughWp.squareIndex !== undefined &&
                 squares[roughWp.squareIndex] === s;
        });

        return matchingSquare || { ...waypoint, bounds: null };
      });

      // Optimize waypoints WITH SEQUENCE for this specific order
      const fineOptimization = optimizeWaypointsWithSequence(orderedSquares, roads, startPoint, roundtrip);
      finalWaypoints = fineOptimization.waypoints;

      performanceLogger.timeEnd('  ↳ Phase 2: Wegpunktoptimierung');

    } else {
      console.warn('[Router] No roads found in area - falling back to centers');
      roadFetchFailed = true;
    }
  } catch (error) {
    console.error('[Router] Road fetching failed:', error);
    roadFetchFailed = true;
  }

  // Fallback if road fetch failed: use square centers
  if (roadFetchFailed || !finalWaypoints) {
    const centerWaypoints = squares.map(s => ({ lat: s.lat, lon: s.lon }));
    const tspResult = solveTSP(centerWaypoints, startPoint, roundtrip);

    finalWaypoints = tspResult.route.filter((wp, idx) => {
      if (idx === 0) return false;
      if (roundtrip && idx === tspResult.route.length - 1) return false;
      return true;
    }).map((wp, i) => {
      // Find matching square to get gridCoords using pointsMatch utility
      const matchingSquare = squares.find(s => pointsMatch(s, wp));

      return {
        lat: wp.lat,
        lon: wp.lon,
        squareIndex: i,
        gridCoords: matchingSquare?.gridCoords,
        hasRoad: false,
        type: 'center-fallback'
      };
    });
  }

  // Build final route (order is already determined by Phase 1 TSP)
  const finalRoute = [startPoint, ...finalWaypoints, ...(roundtrip ? [startPoint] : [])];
  const finalDistance = calculateRouteDistance(finalRoute);
  const finalTspResult = { route: finalRoute, distance: finalDistance };

  // Filter out waypoints without roads (can't be routed for this bike type)
  // Track which squares were skipped by their COORDINATES (not indices)
  const skippedSquareCoords = [];
  const routeWithRoads = [];

  for (let i = 0; i < finalTspResult.route.length; i++) {
    const wp = finalTspResult.route[i];

    // Keep start point (use pointsMatch for safe float comparison)
    if (pointsMatch(wp, startPoint)) {
      routeWithRoads.push(wp);
      continue;
    }

    // Check if this waypoint has roads
    if (wp.hasRoad === false) {
      // This is a skipped square - track its coordinates
      skippedSquareCoords.push({
        lat: wp.lat,
        lon: wp.lon,
        squareIndex: wp.squareIndex,
        type: wp.type
      });
    } else {
      routeWithRoads.push(wp);
    }
  }

  const skippedCount = skippedSquareCoords.length;

  // Check if we have enough waypoints left
  if (routeWithRoads.length < 2) {
    throw new Error(`Keine geeigneten Straßen für Fahrrad-Typ '${bikeType}' gefunden. Versuche einen anderen Routing-Typ (z.B. Trekking statt Rennrad).`);
  }

  // Define profile fallback order
  const profileFallbacks = {
    'trekking': ['fastbike', 'trekking-ignore-cr', 'trekking-noferries'],
    'gravel': ['trekking', 'trekking-ignore-cr'],
    'fastbike': ['fastbike', 'fastbike-lowtraffic']
  };
  const profilesToTry = [bikeType, ...(profileFallbacks[bikeType] || [])];

  // Call BRouter with filtered waypoints
  performanceLogger.time('  ↳ BRouter API Aufruf');
  const result = await tryProfilesWithFallback(profilesToTry, routeWithRoads, apiUrl);
  performanceLogger.timeEnd('  ↳ BRouter API Aufruf');

  if (result.success) {
    const routeData = parseBRouterResponse(result.geojson);
    return {
      ...routeData,
      waypoints: routeWithRoads,
      allSquares: finalTspResult.route,
      straightLineDistance: finalTspResult.distance,
      profileUsed: result.profile,
      roadAware: !roadFetchFailed,
      simplified: false,
      minimal: false,
      skippedSquareCoords: skippedCount > 0 ? skippedSquareCoords : undefined // Coordinates of skipped squares
    };
  }

  // If BRouter fails, throw descriptive error
  throw new Error(`BRouter routing failed: ${result.error.message}`);
}

/**
 * Format time in HH:MM format
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted time string
 */
export function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}
