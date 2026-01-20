import { bench, describe } from 'vitest';
import {
  optimizeSquare,
  calculateLayerDistance,
  manhattanDistance,
  getNeighborKeys
} from '../../src/logic/optimizer.js';

describe('Optimizer Performance', () => {
  // Mock data
  const base = { minI: 0, maxI: 15, minJ: 0, maxJ: 15 }; // 16x16 Übersquadrat
  const LAT_STEP = 0.1;
  const LON_STEP = 0.1;
  const originLat = 50.0;
  const originLon = 8.0;

  // Small visited set (25% filled)
  const smallVisitedSet = new Set();
  for (let i = 0; i <= 15; i += 2) {
    for (let j = 0; j <= 15; j += 2) {
      smallVisitedSet.add(`${i},${j}`);
    }
  }

  // Medium visited set (50% filled)
  const mediumVisitedSet = new Set();
  for (let i = 0; i <= 15; i++) {
    for (let j = 0; j <= 15; j++) {
      if ((i + j) % 2 === 0) {
        mediumVisitedSet.add(`${i},${j}`);
      }
    }
  }

  // Large visited set (75% filled)
  const largeVisitedSet = new Set();
  for (let i = 0; i <= 15; i++) {
    for (let j = 0; j <= 15; j++) {
      if ((i + j) % 4 !== 0) {
        largeVisitedSet.add(`${i},${j}`);
      }
    }
  }

  bench('optimizeSquare - 5 squares, small dataset (25% filled)', () => {
    optimizeSquare(
      base, 5, ['N', 'S', 'E', 'W'], smallVisitedSet,
      LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
    );
  });

  bench('optimizeSquare - 10 squares, medium dataset (50% filled)', () => {
    optimizeSquare(
      base, 10, ['N', 'S', 'E', 'W'], mediumVisitedSet,
      LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
    );
  });

  bench('optimizeSquare - 20 squares, large dataset (75% filled)', () => {
    optimizeSquare(
      base, 20, ['N', 'S', 'E', 'W'], largeVisitedSet,
      LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
    );
  });

  bench('optimizeSquare - edge mode', () => {
    optimizeSquare(
      base, 10, ['N', 'S', 'E', 'W'], mediumVisitedSet,
      LAT_STEP, LON_STEP, originLat, originLon, 'edge', 5
    );
  });

  bench('optimizeSquare - holes mode', () => {
    optimizeSquare(
      base, 10, ['N', 'S', 'E', 'W'], mediumVisitedSet,
      LAT_STEP, LON_STEP, originLat, originLon, 'holes', 5
    );
  });

  bench('calculateLayerDistance - hot path', () => {
    for (let i = 0; i < 100; i++) {
      calculateLayerDistance(i, i, base);
    }
  });

  bench('manhattanDistance - hot path', () => {
    for (let i = 0; i < 100; i++) {
      manhattanDistance({ i: 0, j: 0 }, { i: i, j: i });
    }
  });

  bench('getNeighborKeys - hot path', () => {
    for (let i = 0; i < 100; i++) {
      getNeighborKeys(i, i);
    }
  });
});
