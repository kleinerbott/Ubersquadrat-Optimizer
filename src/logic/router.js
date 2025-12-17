/**
 * Router Module - BRouter Integration for Bicycle Routing
 *
 * Handles route calculation through proposed squares using BRouter API,
 * TSP optimization, and road-aware waypoint selection.
 */

import { solveTSP } from './tsp-solver.js';
import { fetchRoadsInArea } from './road-fetcher.js';
import { optimizeWaypoints, calculateCombinedBounds } from './waypoint-optimizer.js';

/**
 * Extract proposed squares from Leaflet layer
 * Returns center points of all rectangles in the layer
 *
 * @param {L.LayerGroup} proposedLayer - Leaflet layer with proposed squares
 * @returns {Array} Array of {lat, lon, bounds} objects
 */
export function extractProposedSquares(proposedLayer) {
  const squares = [];

  proposedLayer.eachLayer(layer => {
    if (layer.getBounds) {
      const bounds = layer.getBounds();
      const center = bounds.getCenter();

      squares.push({
        lat: center.lat,
        lon: center.lng,
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        }
      });
    }
  });

  return squares;
}

/**
 * Call BRouter API to calculate bicycle route
 *
 * @param {Array} waypoints - Array of {lat, lon} waypoints
 * @param {string} profile - BRouter profile (trekking, gravel, fastbike)
 * @param {string} apiUrl - BRouter API base URL
 * @returns {Promise<Object>} Route data (GeoJSON format)
 */
export async function callBRouterAPI(waypoints, profile, apiUrl = 'https://brouter.de/brouter') {
  if (waypoints.length < 2) {
    throw new Error('Need at least 2 waypoints for routing');
  }

  // Format: lon,lat|lon,lat|...
  const lonlats = waypoints.map(wp => `${wp.lon},${wp.lat}`).join('|');

  // Build URL with parameters
  const url = `${apiUrl}?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;

  console.log(`Calling BRouter API with ${waypoints.length} waypoints, profile=${profile}`);
  console.log('Waypoints:', waypoints.map((wp, i) => `${i}: [${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)}]`).join(', '));
  console.log('Note: BRouter public instance has best coverage for Central Europe. If routing fails, some waypoints may be outside the data coverage area.');

  try {
    const response = await fetch(url);

    if (!response.ok) {
      // Try to get error message from response
      let errorMsg = `BRouter API error: ${response.status} ${response.statusText}`;

      try {
        const errorText = await response.text();
        if (errorText) {
          errorMsg += ` - ${errorText}`;

          // Specific error handling for common issues
          if (errorText.includes('not mapped in existing datafile')) {
            throw new Error('Ein oder mehrere Wegpunkte liegen außerhalb des verfügbaren Kartenbereichs. BRouter hat für diese Region keine Daten.');
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }

      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      throw new Error('BRouter returned no route');
    }

    console.log('BRouter API success:', data);
    return data;
  } catch (error) {
    console.error('BRouter API call failed:', error);
    throw error;
  }
}

/**
 * Parse BRouter GeoJSON response and extract route information
 *
 * @param {Object} geojson - BRouter GeoJSON response
 * @returns {Object} Parsed route data {coordinates, distance, elevation, time}
 */
export function parseBRouterResponse(geojson) {
  if (!geojson.features || geojson.features.length === 0) {
    throw new Error('Invalid GeoJSON: no features');
  }

  const feature = geojson.features[0];
  const geometry = feature.geometry;
  const properties = feature.properties;

  // Extract coordinates (BRouter returns [lon, lat, elevation])
  const coordinates = geometry.coordinates.map(coord => ({
    lon: coord[0],
    lat: coord[1],
    elevation: coord[2] || 0
  }));

  // Extract statistics from properties
  const distance = properties['track-length'] || 0; // meters
  const time = properties['total-time'] || 0; // seconds

  // Calculate elevation gain
  let elevationGain = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const diff = coordinates[i].elevation - coordinates[i - 1].elevation;
    if (diff > 0) elevationGain += diff;
  }

  return {
    coordinates,
    distance: distance / 1000, // Convert to km
    elevationGain: Math.round(elevationGain),
    time: Math.round(time / 60), // Convert to minutes
    rawGeoJSON: geojson
  };
}

/**
 * Simplify waypoints by removing intermediate points that are very close together
 * This helps avoid BRouter waypoint limits and coverage issues
 *
 * @param {Array} waypoints - Array of {lat, lon} waypoints
 * @param {number} minDistance - Minimum distance between waypoints in km (default 0.5 km)
 * @returns {Array} Simplified waypoint array
 */
function simplifyWaypoints(waypoints, minDistance = 0.5) {
  if (waypoints.length <= 2) return waypoints;

  const simplified = [waypoints[0]]; // Always keep start point
  let lastKept = waypoints[0];

  for (let i = 1; i < waypoints.length - 1; i++) {
    // Calculate distance from last kept waypoint
    const R = 6371; // Earth radius in km
    const dLat = (waypoints[i].lat - lastKept.lat) * Math.PI / 180;
    const dLon = (waypoints[i].lon - lastKept.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lastKept.lat * Math.PI / 180) * Math.cos(waypoints[i].lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Keep waypoint if far enough from last kept point
    if (distance >= minDistance) {
      simplified.push(waypoints[i]);
      lastKept = waypoints[i];
    }
  }

  // Always keep end point
  simplified.push(waypoints[waypoints.length - 1]);

  return simplified;
}

/**
 * Main function: Calculate optimal route through proposed squares
 *
 * @param {L.LayerGroup} proposedLayer - Layer with proposed squares
 * @param {Object} startPoint - Starting point {lat, lon}
 * @param {string} bikeType - Bike profile (trekking, gravel, fastbike)
 * @param {boolean} roundtrip - Whether to return to start
 * @param {string} apiUrl - BRouter API URL
 * @returns {Promise<Object>} Route data
 */
export async function calculateRoute(proposedLayer, startPoint, bikeType, roundtrip, apiUrl = 'https://brouter.de/brouter') {
  // Step 1: Extract proposed squares with bounds
  const squares = extractProposedSquares(proposedLayer);

  if (squares.length === 0) {
    throw new Error('Keine vorgeschlagenen Quadrate zum Routen vorhanden');
  }

  console.log(`Routing through ${squares.length} proposed squares`);

  // Step 2: Fetch roads for the area (road-aware routing)
  let optimizedWaypoints;
  let roadFetchFailed = false;

  try {
    // Calculate bounds for all squares
    const squareBounds = squares.map(s => ({
      south: s.bounds.south,
      north: s.bounds.north,
      west: s.bounds.west,
      east: s.bounds.east
    }));
    const combinedBounds = calculateCombinedBounds(squareBounds);

    console.log('Fetching roads for bike type:', bikeType);
    const roads = await fetchRoadsInArea(combinedBounds, bikeType);

    if (roads.length > 0) {
      // Step 3: Optimize waypoints using road data
      const optimization = optimizeWaypoints(squareBounds, roads);
      optimizedWaypoints = optimization.waypoints;

      console.log(`Road-aware optimization: ${optimization.statistics.withRoads}/${optimization.statistics.total} squares have suitable roads`);

      if (optimization.skippedSquares.length > 0) {
        console.warn(`Warning: ${optimization.skippedSquares.length} squares have no ${bikeType}-suitable roads`);
      }
    } else {
      console.warn('No roads found in area, falling back to center points');
      roadFetchFailed = true;
    }
  } catch (error) {
    console.warn('Road fetch failed, falling back to center points:', error.message);
    roadFetchFailed = true;
  }

  // Fallback to square centers if road fetch failed
  if (roadFetchFailed || !optimizedWaypoints) {
    optimizedWaypoints = squares.map((s, i) => ({
      lat: s.lat,
      lon: s.lon,
      squareIndex: i,
      hasRoad: false,
      type: 'center-fallback'
    }));
  }

  // Step 4: Solve TSP to get optimal order
  const waypointCoords = optimizedWaypoints.map(wp => ({ lat: wp.lat, lon: wp.lon }));
  const tspResult = solveTSP(waypointCoords, startPoint, roundtrip, true);

  console.log(`TSP result: ${tspResult.route.length} waypoints, ${tspResult.distance.toFixed(2)} km straight-line distance`);
  console.log(`Waypoint types in route: ${optimizedWaypoints.filter(wp => wp.type === 'intersection').length} intersections, ${optimizedWaypoints.filter(wp => wp.type === 'midpoint').length} midpoints, ${optimizedWaypoints.filter(wp => wp.type === 'nearest').length} nearest, ${optimizedWaypoints.filter(wp => wp.type === 'center-fallback').length} center-fallback`);

  // Step 5: Simplify waypoints if too many or too close together
  let finalWaypoints = tspResult.route;
  let simplificationLevel = 0;

  if (tspResult.route.length > 20) {
    finalWaypoints = simplifyWaypoints(tspResult.route, 0.5);
    simplificationLevel = 1;
    console.log(`Waypoints simplified (level 1): ${tspResult.route.length} → ${finalWaypoints.length}`);
  }

  // Step 6: Check waypoint limit
  if (finalWaypoints.length > 50) {
    console.warn(`Route has ${finalWaypoints.length} waypoints, BRouter limit is ~60. May fail.`);
  }

  // Helper function for more aggressive simplification if needed
  const tryMoreAggressive = () => {
    if (simplificationLevel === 0) {
      finalWaypoints = simplifyWaypoints(tspResult.route, 1.0);
      simplificationLevel = 2;
      console.log(`Waypoints simplified (level 2 - aggressive): ${tspResult.route.length} → ${finalWaypoints.length}`);
    } else if (simplificationLevel === 1) {
      finalWaypoints = simplifyWaypoints(tspResult.route, 1.5);
      simplificationLevel = 3;
      console.log(`Waypoints simplified (level 3 - very aggressive): ${tspResult.route.length} → ${finalWaypoints.length}`);
    }
    return finalWaypoints;
  };

  // Step 7: Call BRouter API with fallback profiles
  const profileFallbacks = {
    'trekking': ['fastbike', 'trekking-ignore-cr', 'trekking-noferries'],
    'gravel': ['trekking', 'fastbike'],
    'fastbike': ['trekking', 'fastbike-lowtraffic']
  };

  let lastError = null;
  const profilesToTry = [bikeType, ...(profileFallbacks[bikeType] || [])];
  let profileAttempts = 0;

  for (const profile of profilesToTry) {
    profileAttempts++;
    try {
      console.log(`Trying profile: ${profile} (attempt ${profileAttempts}/${profilesToTry.length})`);
      const geojson = await callBRouterAPI(finalWaypoints, profile, apiUrl);

      // Step 8: Parse response
      const routeData = parseBRouterResponse(geojson);

      if (profile !== bikeType) {
        console.warn(`Routing succeeded with fallback profile: ${profile} (requested: ${bikeType})`);
      }

      return {
        ...routeData,
        waypoints: finalWaypoints,
        allSquares: tspResult.route, // Keep all squares for reference
        straightLineDistance: tspResult.distance,
        profileUsed: profile,
        roadAware: !roadFetchFailed
      };
    } catch (error) {
      lastError = error;
      console.warn(`Profile ${profile} failed:`, error.message);

      // If this is a data coverage error, try more aggressive simplification before next profile
      if ((error.message.includes('nicht verfügbaren Kartenbereichs') ||
           error.message.includes('not mapped')) &&
          simplificationLevel < 3) {
        console.log('Trying more aggressive waypoint simplification...');
        finalWaypoints = tryMoreAggressive();

        // Retry the same profile with simplified waypoints
        try {
          console.log(`Retrying profile: ${profile} with ${finalWaypoints.length} waypoints`);
          const geojson = await callBRouterAPI(finalWaypoints, profile, apiUrl);
          const routeData = parseBRouterResponse(geojson);

          console.warn(`Routing succeeded after simplification with profile: ${profile}`);

          return {
            ...routeData,
            waypoints: finalWaypoints,
            allSquares: tspResult.route,
            straightLineDistance: tspResult.distance,
            profileUsed: profile,
            roadAware: !roadFetchFailed
          };
        } catch (retryError) {
          console.warn(`Retry with simplified waypoints also failed:`, retryError.message);
          lastError = retryError;
        }
      }

      // If not a data coverage error, don't retry with different profiles
      if (!error.message.includes('nicht verfügbaren Kartenbereichs') &&
          !error.message.includes('not mapped')) {
        break;
      }
    }
  }

  // All profiles failed - try one last strategy: remove middle waypoints
  if (finalWaypoints.length > 3) {
    console.warn('All profiles failed. Last attempt: removing some middle waypoints to create a simpler route...');

    // Keep only start, end, and every 2nd or 3rd waypoint
    const minimalWaypoints = [finalWaypoints[0]]; // Start
    const step = Math.ceil((finalWaypoints.length - 2) / Math.min(8, finalWaypoints.length - 2));

    for (let i = step; i < finalWaypoints.length - 1; i += step) {
      minimalWaypoints.push(finalWaypoints[i]);
    }

    minimalWaypoints.push(finalWaypoints[finalWaypoints.length - 1]); // End

    console.log(`Minimal route attempt: ${finalWaypoints.length} → ${minimalWaypoints.length} waypoints`);

    // Try with the first (requested) profile only
    try {
      const geojson = await callBRouterAPI(minimalWaypoints, bikeType, apiUrl);
      const routeData = parseBRouterResponse(geojson);

      console.warn(`Routing succeeded with minimal waypoints strategy (${minimalWaypoints.length} waypoints)`);

      return {
        ...routeData,
        waypoints: minimalWaypoints,
        allSquares: tspResult.route,
        straightLineDistance: tspResult.distance,
        profileUsed: bikeType,
        simplified: true,
        roadAware: !roadFetchFailed
      };
    } catch (minimalError) {
      console.error('Even minimal route failed:', minimalError);
    }
  }

  // Truly failed
  console.error('All routing strategies exhausted:', lastError);
  throw new Error(`Routing fehlgeschlagen nach ${profileAttempts} Versuchen mit allen Strategien. Möglicherweise liegen einige Quadrate außerhalb der verfügbaren Routingdaten. Versuchen Sie es mit weniger Quadraten (< 15).`);
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
