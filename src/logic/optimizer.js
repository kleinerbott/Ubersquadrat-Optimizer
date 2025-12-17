/**
 * Optimizer Wrapper
 *
 * Routes to either strategic or orienteering optimizer based on approach parameter.
 * This allows both algorithms to coexist and be selected via UI toggle.
 */

import { optimizeStrategic } from './strategic-optimizer.js';
import { optimizeOrienteering } from './orienteering-optimizer.js';

/**
 * Main optimization entry point
 *
 * @param {Object} base - Übersquadrat bounds {minI, maxI, minJ, maxJ}
 * @param {number} targetNew - Number of new squares to recommend (strategic mode only)
 * @param {Array} direction - Selected directions ['N', 'S', 'E', 'W']
 * @param {Set} visitedSet - Set of "i,j" visited squares
 * @param {number} LAT_STEP - Grid cell height (degrees)
 * @param {number} LON_STEP - Grid cell width (degrees)
 * @param {number} originLat - Grid origin latitude
 * @param {number} originLon - Grid origin longitude
 * @param {string} optimizationMode - 'balanced', 'edge', or 'holes'
 * @param {number} maxHoleSize - Maximum hole size to consider (1-20)
 * @param {string} approach - 'strategic' or 'orienteering' (default: 'strategic')
 * @param {number} maxDistance - Max cycling distance in km (orienteering mode only, default: 50)
 * @param {number} routingWeight - Route priority weight 0.5-2.0 (orienteering mode only, default: 1.0)
 * @param {Object} startPoint - User-selected start point {lat, lon} (orienteering mode only, default: center of Übersquadrat)
 * @returns {Array} Array of [[lat,lon], [lat,lon]] rectangle bounds
 */
export function optimizeSquare(
  base,
  targetNew,
  direction,
  visitedSet,
  LAT_STEP,
  LON_STEP,
  originLat,
  originLon,
  optimizationMode = 'balanced',
  maxHoleSize = 5,
  approach = 'strategic',
  maxDistance = 50,
  routingWeight = 1.0,
  startPoint = null
) {
  if (approach === 'orienteering') {
    // Route-first optimization: considers cycling distance from the start
    return optimizeOrienteering(base, {
      maxDistance,
      routingWeight,
      direction,
      visitedSet,
      LAT_STEP,
      LON_STEP,
      originLat,
      originLon,
      optimizationMode,
      maxHoleSize,
      startPoint
    });
  } else {
    // Strategic optimization: maximizes strategic value, routing done afterward
    return optimizeStrategic(
      base,
      targetNew,
      direction,
      visitedSet,
      LAT_STEP,
      LON_STEP,
      originLat,
      originLon,
      optimizationMode,
      maxHoleSize
    );
  }
}
