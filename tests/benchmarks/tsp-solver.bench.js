import { bench, describe } from 'vitest';
import {
  nearestNeighbor,
  calculateRouteDistance,
  solveTSP,
  twoOptOptimize
} from '../../src/logic/tsp-solver.js';

describe('TSP Solver Performance', () => {
  const startPoint = { lat: 50.0, lon: 8.0 };

  // Generate point grids of different sizes
  function generatePoints(count) {
    const points = [];
    const gridSize = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      points.push({
        lat: 50.0 + row * 0.01,
        lon: 8.0 + col * 0.01
      });
    }
    return points;
  }

  const points5 = generatePoints(5);
  const points10 = generatePoints(10);
  const points20 = generatePoints(20);
  const points50 = generatePoints(50);

  bench('nearestNeighbor - 5 points', () => {
    nearestNeighbor(points5, startPoint, false);
  });

  bench('nearestNeighbor - 10 points', () => {
    nearestNeighbor(points10, startPoint, false);
  });

  bench('nearestNeighbor - 20 points', () => {
    nearestNeighbor(points20, startPoint, false);
  });

  bench('nearestNeighbor - 50 points', () => {
    nearestNeighbor(points50, startPoint, false);
  });

  bench('solveTSP with 2-opt - 5 points', () => {
    solveTSP(points5, startPoint, false, true);
  });

  bench('solveTSP with 2-opt - 10 points', () => {
    solveTSP(points10, startPoint, false, true);
  });

  bench('solveTSP with 2-opt - 20 points', () => {
    solveTSP(points20, startPoint, false, true);
  });

  bench('solveTSP without 2-opt - 20 points', () => {
    solveTSP(points20, startPoint, false, false);
  });

  bench('solveTSP with roundtrip - 10 points', () => {
    solveTSP(points10, startPoint, true, true);
  });

  // Benchmark route distance calculation
  const route10 = nearestNeighbor(points10, startPoint, false);
  const route50 = nearestNeighbor(points50, startPoint, false);

  bench('calculateRouteDistance - 10 points', () => {
    calculateRouteDistance(route10);
  });

  bench('calculateRouteDistance - 50 points', () => {
    calculateRouteDistance(route50);
  });

  // Benchmark 2-opt optimization
  const unoptimizedRoute = [startPoint, ...points10, startPoint];

  bench('twoOptOptimize - 10 points', () => {
    twoOptOptimize(unoptimizedRoute, 100);
  });

  bench('twoOptOptimize - 20 points', () => {
    const route = [startPoint, ...points20, startPoint];
    twoOptOptimize(route, 100);
  });
});
