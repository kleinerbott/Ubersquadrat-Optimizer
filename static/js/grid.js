/**
 * Grid Management Module
 * Handles grid calculations, cell scanning, and grid visualization
 */

import { CONFIG } from './config.js';
import { calculateBounds, isPointInPolygonWithHoles } from './kml-processor.js';

// ===== GRID CALCULATION FUNCTIONS =====

/**
 * Calculate grid parameters from ubersquadrat
 * @param {Array} uberCoords - Ubersquadrat polygon coordinates
 * @param {number} uberSize - Grid size (e.g., 16 for 16x16)
 * @returns {Object} Grid parameters including steps, origin, bounds, and baseSquare indices
 */
export function calculateGridParameters(uberCoords, uberSize) {
  console.log('Ubersquadrat size:', uberSize, 'x', uberSize, 'squadrats');

  // Calculate ubersquadrat bounds
  const uberBounds = calculateBounds(uberCoords);
  const { minLat: uberMinLat, maxLat: uberMaxLat, minLon: uberMinLon, maxLon: uberMaxLon } = uberBounds;

  // Calculate grid steps directly from ubersquadrat dimensions
  const latStep = (uberMaxLat - uberMinLat) / uberSize;
  const lonStep = (uberMaxLon - uberMinLon) / uberSize;

  console.log('Grid steps from ubersquadrat:', 'LAT=', latStep.toFixed(7), 'LON=', lonStep.toFixed(7));

  // Set grid origin to ubersquadrat SW corner
  const originLat = uberMinLat;
  const originLon = uberMinLon;
  console.log('Grid origin (ubersquadrat SW corner):', originLat.toFixed(7), originLon.toFixed(7));

  // Ubersquadrat grid indices - since origin is at ubersquadrat SW corner
  const baseSquare = {
    minI: 0,
    maxI: uberSize - 1,
    minJ: 0,
    maxJ: uberSize - 1
  };

  console.log('Ubersquadrat grid: i=[', baseSquare.minI, 'to', baseSquare.maxI, '], j=[', baseSquare.minJ, 'to', baseSquare.maxJ, ']');

  return {
    latStep,
    lonStep,
    originLat,
    originLon,
    baseSquare,
    bounds: uberBounds
  };
}

/**
 * Scan grid area and build visited set by checking which cells are inside polygons
 * @param {Array} allPolygons - All polygons including ubersquadrat
 * @param {Object} baseSquare - Base square grid indices {minI, maxI, minJ, maxJ}
 * @param {Object} gridParams - Grid parameters {latStep, lonStep, originLat, originLon}
 * @returns {Set} Set of "i,j" strings representing visited grid cells
 */
export function scanAndBuildVisitedSet(allPolygons, baseSquare, gridParams) {
  const visitedSet = new Set();
  const { latStep, lonStep, originLat, originLon } = gridParams;

  console.log('Starting grid-based scan of', allPolygons.length, 'polygons...');

  // Define scan area for new squares
  const scanMinI = baseSquare.minI - CONFIG.SCAN_RADIUS_BUFFER;
  const scanMaxI = baseSquare.maxI + CONFIG.SCAN_RADIUS_BUFFER;
  const scanMinJ = baseSquare.minJ - CONFIG.SCAN_RADIUS_BUFFER;
  const scanMaxJ = baseSquare.maxJ + CONFIG.SCAN_RADIUS_BUFFER;

  console.log('Scanning grid area: i=[', scanMinI, 'to', scanMaxI, '], j=[', scanMinJ, 'to', scanMaxJ, ']');

  let gridCellsChecked = 0;
  let gridCellsMarked = 0;

  for (let i = scanMinI; i <= scanMaxI; i++) {
    for (let j = scanMinJ; j <= scanMaxJ; j++) {
      gridCellsChecked++;

      // Calculate grid cell center
      const cellCenterLat = originLat + (i + CONFIG.GRID_CELL_CENTER_OFFSET) * latStep;
      const cellCenterLon = originLon + (j + CONFIG.GRID_CELL_CENTER_OFFSET) * lonStep;

      // Check if this cell center is inside any polygon
      let foundInPolygon = false;

      for (const poly of allPolygons) {
        // Check if point is inside polygon (accounting for holes)
        if (isPointInPolygonWithHoles(cellCenterLat, cellCenterLon, poly)) {
          foundInPolygon = true;
          break;
        }
      }

      if (foundInPolygon) {
        visitedSet.add(`${i},${j}`);
        gridCellsMarked++;
      }
    }
  }

  console.log('Grid scan complete:', gridCellsChecked, 'cells checked,', gridCellsMarked, 'cells marked as visited');
  console.log('Visited set size:', visitedSet.size);

  return visitedSet;
}

// ===== GRID VISUALIZATION FUNCTIONS =====

/**
 * Visualize ubersquadrat as blue rectangle on map
 * @param {Object} baseSquare - Base square grid indices
 * @param {Object} gridParams - Grid parameters
 * @param {Object} visitedLayer - Leaflet layer to add rectangle to
 */
export function visualizeUbersquadrat(baseSquare, gridParams, visitedLayer) {
  const { latStep, lonStep, originLat, originLon } = gridParams;

  // Draw the blue rectangle using grid-aligned coordinates
  const gridAlignedMinLat = originLat + baseSquare.minI * latStep;
  const gridAlignedMaxLat = originLat + (baseSquare.maxI + 1) * latStep;
  const gridAlignedMinLon = originLon + baseSquare.minJ * lonStep;
  const gridAlignedMaxLon = originLon + (baseSquare.maxJ + 1) * lonStep;

  console.log('Blue rectangle grid-aligned coords:',
    '[', gridAlignedMinLat.toFixed(6), ',', gridAlignedMinLon.toFixed(6), '] to',
    '[', gridAlignedMaxLat.toFixed(6), ',', gridAlignedMaxLon.toFixed(6), ']');

  L.rectangle(
    [[gridAlignedMinLat, gridAlignedMinLon], [gridAlignedMaxLat, gridAlignedMaxLon]],
    {
      color: CONFIG.UBERSQUADRAT_COLOR,
      fillColor: CONFIG.UBERSQUADRAT_COLOR,
      fillOpacity: CONFIG.UBERSQUADRAT_OPACITY
    }
  ).addTo(visitedLayer);
}

/**
 * Draw grid lines on the map
 * @param {Object} baseSquare - Base square grid indices
 * @param {Object} gridParams - Grid parameters
 * @param {Object} gridLayer - Leaflet layer to add grid lines to
 */
export function drawGridLines(baseSquare, gridParams, gridLayer) {
  const { latStep, lonStep, originLat, originLon } = gridParams;

  gridLayer.clearLayers();

  // Calculate grid area to cover (extend beyond ubersquadrat)
  const gridMinI = baseSquare.minI - CONFIG.GRID_DISPLAY_BUFFER;
  const gridMaxI = baseSquare.maxI + CONFIG.GRID_DISPLAY_BUFFER;
  const gridMinJ = baseSquare.minJ - CONFIG.GRID_DISPLAY_BUFFER;
  const gridMaxJ = baseSquare.maxJ + CONFIG.GRID_DISPLAY_BUFFER;

  // Draw horizontal grid lines (constant latitude)
  for (let i = gridMinI; i <= gridMaxI + 1; i++) {
    const lat = originLat + i * latStep;
    const lonStart = originLon + gridMinJ * lonStep;
    const lonEnd = originLon + (gridMaxJ + 1) * lonStep;

    L.polyline([[lat, lonStart], [lat, lonEnd]], {
      color: CONFIG.GRID_LINE_COLOR,
      weight: 1,
      opacity: CONFIG.GRID_LINE_OPACITY
    }).addTo(gridLayer);
  }

  // Draw vertical grid lines (constant longitude)
  for (let j = gridMinJ; j <= gridMaxJ + 1; j++) {
    const lon = originLon + j * lonStep;
    const latStart = originLat + gridMinI * latStep;
    const latEnd = originLat + (gridMaxI + 1) * latStep;

    L.polyline([[latStart, lon], [latEnd, lon]], {
      color: CONFIG.GRID_VERTICAL_COLOR,
      weight: 1,
      opacity: CONFIG.GRID_VERTICAL_OPACITY
    }).addTo(gridLayer);
  }

  console.log('Grid drawn:', (gridMaxI - gridMinI + 2), 'horizontal lines,', (gridMaxJ - gridMinJ + 2), 'vertical lines');
}
