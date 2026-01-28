/**
 * Router Module - BRouter Integration for Bicycle Routing
 *
 * Handles route calculation through proposed squares using BRouter API,
 * TSP optimization, and road-aware waypoint selection.
 */

import { solveTSP, calculateRouteDistance, refineCandidates, twoOptOptimize } from './tsp-solver.js';
import { fetchRoadsFromInstance, OVERPASS_INSTANCES } from './road-fetcher.js';
import { optimizeWaypoints, optimizeWaypointsWithSequence, calculateCombinedBounds } from './waypoint-optimizer.js';
import { pointsMatch } from './bounds-utils.js';
import { callBRouterAPI, parseBRouterResponse } from './brouter-api.js';

// Re-export BRouter API functions for backward compatibility
export { callBRouterAPI, parseBRouterResponse };

/**
 * Group squares by cardinal direction to create smaller Overpass queries
 *
 * @param {Array} squares - Array of square objects with bounds
 * @returns {Array} Array of {direction: string, squares: Array} groups
 */
function groupSquaresByDirection(squares) {
  if (squares.length === 0) return [];
  if (squares.length === 1) return [{ direction: 'Single', squares }];

  const avgLat = squares.reduce((sum, s) => sum + s.lat, 0) / squares.length;
  const avgLon = squares.reduce((sum, s) => sum + s.lon, 0) / squares.length;

  const north = [];
  const south = [];
  const east = [];
  const west = [];

  for (const square of squares) {
    const latDiff = square.lat - avgLat;
    const lonDiff = square.lon - avgLon;

    // Determine primary direction (larger difference)
    if (Math.abs(latDiff) > Math.abs(lonDiff)) {
      if (latDiff > 0) {
        north.push(square);
      } else {
        south.push(square);
      }
    } else {
      if (lonDiff > 0) {
        east.push(square);
      } else {
        west.push(square);
      }
    }
  }

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

      const meta = proposedMetadata[squares.length]; 
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
 * @param {string} bikeType - Bike profile (trekking, mtb, fastbike)
 * @param {boolean} roundtrip - Whether to return to start
 * @param {string} apiUrl - BRouter API URL
 * @param {Array} proposedMetadata - Optional metadata with grid coordinates
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Promise<Object>} Route data
 */
export async function calculateRoute(proposedLayer, startPoint, bikeType, roundtrip, apiUrl = 'https://brouter.de/brouter', proposedMetadata = [], onProgress = null) {
  // Step 1: Extract proposed squares with bounds and grid coordinates
  const squares = extractProposedSquares(proposedLayer, proposedMetadata);

  if (squares.length === 0) {
    throw new Error('Keine vorgeschlagenen Quadrate zum Routen vorhanden');
  }

  
  // Phase 1: Find optimal visit order using rough waypoints
  // Phase 2: Optimize waypoints for that specific order

  let finalWaypoints;
  let roadFetchFailed = false;

  try {
    console.time('  ↳ Straßen laden (Overpass API)');
    const squareGroups = groupSquaresByDirection(squares);

    if (onProgress) {
      onProgress(`Lade Straßendaten für ${squareGroups.length} Gebiet${squareGroups.length > 1 ? 'e' : ''} parallel...`);
    }

    // Distribute requests across first 2 instances (rate limit: 2 immediate per instance)
    const primaryInstances = OVERPASS_INSTANCES.slice(0, 2);
    const fallbackInstance = OVERPASS_INSTANCES[2];

    // Prepare parallel fetch promises - distribute round-robin across 2 instances
    const fetchPromises = squareGroups.map((group, idx) => {
      const instanceUrl = primaryInstances[idx % primaryInstances.length];
      const groupBounds = calculateCombinedBounds(group.squares.map(s => s.bounds));

      return fetchRoadsFromInstance(groupBounds, bikeType, instanceUrl, 2, (msg) => {
        if (onProgress) onProgress(`${group.direction}: ${msg}`);
      }).then(result => ({ ...result, group, groupBounds }));
    });

    const results = await Promise.all(fetchPromises);

    const failedGroups = results.filter(r => !r.success);
    if (failedGroups.length > 0 && fallbackInstance) {

      if (onProgress) {
        onProgress(`${failedGroups.length} fehlgeschlagen, versuche Backup-Server...`);
      }

      for (const failed of failedGroups) {
        const retryResult = await fetchRoadsFromInstance(
          failed.groupBounds,
          bikeType,
          fallbackInstance,
          2,
          (msg) => { if (onProgress) onProgress(`Backup ${failed.group.direction}: ${msg}`); }
        );

        const idx = results.findIndex(r => r.group === failed.group);
        if (idx !== -1 && retryResult.success) {
          results[idx] = { ...retryResult, group: failed.group, groupBounds: failed.groupBounds };
        }
      }
    }

    // Merge roads by ID
    const roadMap = new Map();
    for (const result of results) {
      for (const road of (result.roads || [])) {
        const id = road.properties?.id;
        if (id && !roadMap.has(id)) {
          roadMap.set(id, road);
        } else if (!id) {
          roadMap.set(Math.random(), road);
        }
      }
    }
    const roads = Array.from(roadMap.values());

    const successCount = results.filter(r => r.success).length;
    console.timeEnd('  ↳ Straßen laden (Overpass API)');

    if (roads.length > 0) {

      // PHASE 1: Find optimal visit order

      console.time('  ↳ Phase 1: Besuchsreihenfolge (TSP)');

      if (onProgress) {
        onProgress('Berechne optimale Besuchsreihenfolge...');
      }

      // Optimize waypoints WITHOUT sequence (neutral, just find roads)
      const roughOptimization = optimizeWaypoints(squares, roads);
      const roughWaypoints = roughOptimization.waypoints;

      // Solve TSP with these rough waypoints to get initial visit order
      const roughWaypointCoords = roughWaypoints.map(wp => ({ lat: wp.lat, lon: wp.lon }));
      const tspResult = solveTSP(roughWaypointCoords, startPoint, roundtrip);

      console.timeEnd('  ↳ Phase 1: Besuchsreihenfolge (TSP)');

      // PHASE 2: Optimize waypoints for this specific order

      console.time('  ↳ Phase 2: Wegpunktoptimierung');

      if (onProgress) {
        onProgress('Optimiere Wegpunkte auf Straßen...');
      }

      let routeSquaresOnly = tspResult.route.filter((waypoint, idx) => {
        if (idx === 0) return false;
        if (roundtrip && idx === tspResult.route.length - 1) return false;
        return true;
      });

      // Map TSP waypoints back to original squares
      const orderedSquares = routeSquaresOnly.map((waypoint, idx) => {
        const matchingSquare = squares.find(s => {
          const roughWp = roughWaypoints.find(rw => pointsMatch(rw, waypoint));
          if (!roughWp) return false;

          return roughWp.squareIndex !== undefined &&
                 squares[roughWp.squareIndex] === s;
        });

        return matchingSquare || { ...waypoint, bounds: null };
      });

      const fineOptimization = optimizeWaypointsWithSequence(orderedSquares, roads, startPoint, roundtrip);
      finalWaypoints = fineOptimization.waypoints;

      console.timeEnd('  ↳ Phase 2: Wegpunktoptimierung');

      // Phase 3: Alternating optimization - refine candidates and re-run 2-opt
      console.time('  ↳ Phase 3: Alternating Optimization');

      let currentRoute = [startPoint, ...finalWaypoints, ...(roundtrip ? [startPoint] : [])];
      let lastDistance = calculateRouteDistance(currentRoute);

      for (let round = 0; round < 3; round++) {
        // Step 1: Try swapping candidates (uses total route distance)
        const refined = refineCandidates(currentRoute);

        if (refined.swaps === 0 && round > 0) {
          // No improvements found, converged
          break;
        }

        // Step 2: Re-run 2-opt to check if order should change
        currentRoute = twoOptOptimize(refined.route);

        const newDistance = calculateRouteDistance(currentRoute);
        if (newDistance >= lastDistance - 0.01) {
          // Converged - no significant improvement
          break;
        }
        lastDistance = newDistance;
      }

      // Extract final waypoints (remove start/end points)
      finalWaypoints = currentRoute.slice(1, roundtrip ? -1 : undefined);

      console.timeEnd('  ↳ Phase 3: Alternating Optimization');

    } else {
      console.warn('[Router] No roads found in area - falling back to centers');
      roadFetchFailed = true;
    }
  } catch (error) {
    console.error('[Router] Road fetching failed:', error);
    roadFetchFailed = true;
  }

  if (roadFetchFailed || !finalWaypoints) {
    const centerWaypoints = squares.map(s => ({ lat: s.lat, lon: s.lon }));
    const tspResult = solveTSP(centerWaypoints, startPoint, roundtrip);

    finalWaypoints = tspResult.route.filter((wp, idx) => {
      if (idx === 0) return false;
      if (roundtrip && idx === tspResult.route.length - 1) return false;
      return true;
    }).map((wp, i) => {
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
  
/**
 * Tries multiple BRouter profiles with automatic fallback
 *
 * @param {Array} profiles - Array of profile names to try
 * @param {Array} waypoints - Array of waypoints
 * @param {string} apiUrl - BRouter API URL
 * @returns {Promise<Object>} {success, geojson, profile, attemptNumber, error}
 */
async function tryProfilesWithFallback(profiles, waypoints, apiUrl) {
  let lastError = null;

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];

    try {
      const geojson = await callBRouterAPI(waypoints, profile, apiUrl);
      return {
        success: true,
        geojson,
        profile,
        attemptNumber: i + 1
      };
    } catch (error) {
      lastError = error;

      if (!isCoverageError(error)) {
        break;
      }
    }
  }

  return { success: false, error: lastError };
}

/**
 * Helper: Detect coverage errors from BRouter
 *
 * @param {Error} error - Error object
 * @returns {boolean} True if error indicates data coverage issue
 */
function isCoverageError(error) {
  return error.message.includes('nicht verfügbaren Kartenbereichs') ||
         error.message.includes('not mapped');
}


  // Build final route 
  const finalRoute = [startPoint, ...finalWaypoints, ...(roundtrip ? [startPoint] : [])];
  const finalDistance = calculateRouteDistance(finalRoute);
  const finalTspResult = { route: finalRoute, distance: finalDistance };

  const skippedSquareCoords = [];
  const routeWithRoads = [];

  for (let i = 0; i < finalTspResult.route.length; i++) {
    const wp = finalTspResult.route[i];

    if (pointsMatch(wp, startPoint)) {
      routeWithRoads.push(wp);
      continue;
    }

    if (wp.hasRoad === false) {
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

  if (routeWithRoads.length < 2) {
    throw new Error(`Keine geeigneten Straßen für Fahrrad-Typ '${bikeType}' gefunden. Versuche einen anderen Routing-Typ (z.B. Trekking statt Rennrad).`);
  }

  // Define profile fallback order
  const profileFallbacks = {
    'trekking': ['fastbike', 'trekking-ignore-cr', 'trekking-noferries'],
    'hiking-mountain': ['trekking', 'trekking-ignore-cr'],
    'fastbike': ['fastbike', 'fastbike-lowtraffic']
  };
  const profilesToTry = [bikeType, ...(profileFallbacks[bikeType] || [])];

  // Call BRouter with filtered waypoints
  console.time('  ↳ BRouter API Aufruf');

  if (onProgress) {
    onProgress('Berechne Fahrradroute mit BRouter...');
  }

  const result = await tryProfilesWithFallback(profilesToTry, routeWithRoads, apiUrl);
  console.timeEnd('  ↳ BRouter API Aufruf');

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
