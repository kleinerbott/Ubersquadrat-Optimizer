import { describe, it, expect } from 'vitest';
import {
  nearestNeighbor,
  calculateRouteDistance,
  solveTSP,
  twoOptOptimize
} from '../../src/logic/tsp-solver.js';

describe('tsp-solver.js', () => {
  describe('nearestNeighbor', () => {
    const startPoint = { lat: 50.0, lon: 8.0 };

    it('returns only start point when no points given', () => {
      const result = nearestNeighbor([], startPoint);
      expect(result).toEqual([startPoint]);
    });

    it('handles single point without roundtrip', () => {
      const points = [{ lat: 50.1, lon: 8.1 }];
      const result = nearestNeighbor(points, startPoint, false);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(startPoint);
      expect(result[1]).toEqual(points[0]);
    });

    it('handles single point with roundtrip', () => {
      const points = [{ lat: 50.1, lon: 8.1 }];
      const result = nearestNeighbor(points, startPoint, true);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(startPoint);
      expect(result[1]).toEqual(points[0]);
      expect(result[2]).toEqual(startPoint);
    });

    it('visits all points exactly once without roundtrip', () => {
      const points = [
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 },
        { lat: 50.3, lon: 8.0 }
      ];
      const result = nearestNeighbor(points, startPoint, false);
      expect(result).toHaveLength(4); // start + 3 points
      expect(result[0]).toEqual(startPoint);
      // Verify all points are visited
      points.forEach(p => {
        expect(result).toContainEqual(p);
      });
    });

    it('visits all points and returns to start with roundtrip', () => {
      const points = [
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 }
      ];
      const result = nearestNeighbor(points, startPoint, true);
      expect(result).toHaveLength(4); // start + 2 points + start
      expect(result[0]).toEqual(startPoint);
      expect(result[result.length - 1]).toEqual(startPoint);
    });

    it('chooses nearest point first (greedy)', () => {
      const points = [
        { lat: 50.5, lon: 8.5 }, // Far
        { lat: 50.01, lon: 8.01 }, // Near
        { lat: 50.9, lon: 8.9 }  // Very far
      ];
      const result = nearestNeighbor(points, startPoint, false);
      // Second element should be the nearest point
      expect(result[1]).toEqual({ lat: 50.01, lon: 8.01 });
    });
  });

  describe('calculateRouteDistance', () => {
    it('returns 0 for empty route', () => {
      const distance = calculateRouteDistance([]);
      expect(distance).toBe(0);
    });

    it('returns 0 for single point', () => {
      const distance = calculateRouteDistance([{ lat: 50.0, lon: 8.0 }]);
      expect(distance).toBe(0);
    });

    it('calculates distance between two points', () => {
      const route = [
        { lat: 50.0, lon: 8.0 },
        { lat: 50.1, lon: 8.0 }
      ];
      const distance = calculateRouteDistance(route);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeCloseTo(11.1, 0); // ~11.1 km for 0.1 degree latitude
    });

    it('calculates cumulative distance for multiple points', () => {
      const route = [
        { lat: 50.0, lon: 8.0 },
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 }
      ];
      const distance = calculateRouteDistance(route);
      expect(distance).toBeGreaterThan(20); // ~22 km
      expect(distance).toBeCloseTo(22.2, 0);
    });

    it('handles roundtrip correctly', () => {
      const route = [
        { lat: 50.0, lon: 8.0 },
        { lat: 50.1, lon: 8.0 },
        { lat: 50.0, lon: 8.0 } // Back to start
      ];
      const distance = calculateRouteDistance(route);
      expect(distance).toBeCloseTo(22.2, 0); // ~22 km (11 + 11)
    });
  });

  describe('solveTSP', () => {
    const startPoint = { lat: 50.0, lon: 8.0 };

    it('returns correct structure', () => {
      const points = [
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 }
      ];
      const result = solveTSP(points, startPoint);
      expect(result).toHaveProperty('route');
      expect(result).toHaveProperty('distance');
      expect(Array.isArray(result.route)).toBe(true);
      expect(typeof result.distance).toBe('number');
    });

    it('handles empty points array', () => {
      const result = solveTSP([], startPoint);
      expect(result.route).toEqual([startPoint]);
      expect(result.distance).toBe(0);
    });

    it('solves for multiple points without roundtrip', () => {
      const points = [
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 },
        { lat: 50.3, lon: 8.0 }
      ];
      const result = solveTSP(points, startPoint, false);
      expect(result.route).toHaveLength(4); // start + 3 points
      expect(result.route[0]).toEqual(startPoint);
      expect(result.distance).toBeGreaterThan(0);
    });

    it('solves for multiple points with roundtrip', () => {
      const points = [
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 }
      ];
      const result = solveTSP(points, startPoint, true);
      expect(result.route).toHaveLength(4); // start + 2 points + start
      expect(result.route[0]).toEqual(startPoint);
      expect(result.route[result.route.length - 1]).toEqual(startPoint);
    });

    it('optimization reduces or maintains distance', () => {
      const points = [
        { lat: 50.0, lon: 8.1 },
        { lat: 50.1, lon: 8.1 },
        { lat: 50.1, lon: 8.0 },
        { lat: 50.0, lon: 8.0 }
      ];

      const withoutOpt = solveTSP(points, startPoint, false, false);
      const withOpt = solveTSP(points, startPoint, false, true);

      expect(withOpt.distance).toBeLessThanOrEqual(withoutOpt.distance);
    });

    it('can be disabled optimization', () => {
      const points = [
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 }
      ];
      const result = solveTSP(points, startPoint, false, false);
      expect(result.route).toHaveLength(3);
      expect(result.distance).toBeGreaterThan(0);
    });
  });

  describe('twoOptOptimize', () => {
    it('returns route unchanged if less than 4 points', () => {
      const route = [
        { lat: 50.0, lon: 8.0 },
        { lat: 50.1, lon: 8.0 },
        { lat: 50.2, lon: 8.0 }
      ];
      const result = twoOptOptimize(route);
      expect(result).toEqual(route);
    });

    it('optimizes a crossing route', () => {
      // Create a route that crosses itself (square visited in wrong order)
      const route = [
        { lat: 50.0, lon: 8.0 },  // Start
        { lat: 50.1, lon: 8.1 },  // NE
        { lat: 50.0, lon: 8.1 },  // SE
        { lat: 50.1, lon: 8.0 },  // NW
        { lat: 50.0, lon: 8.0 }   // Back to start
      ];

      const originalDistance = calculateRouteDistance(route);
      const optimized = twoOptOptimize(route);
      const optimizedDistance = calculateRouteDistance(optimized);

      expect(optimizedDistance).toBeLessThanOrEqual(originalDistance);
    });

    it('maintains start and end points', () => {
      const route = [
        { lat: 50.0, lon: 8.0 },
        { lat: 50.1, lon: 8.1 },
        { lat: 50.1, lon: 8.0 },
        { lat: 50.0, lon: 8.1 },
        { lat: 50.0, lon: 8.0 }
      ];

      const optimized = twoOptOptimize(route);
      expect(optimized[0]).toEqual(route[0]);
      expect(optimized[optimized.length - 1]).toEqual(route[route.length - 1]);
    });

    it('respects max iterations parameter', () => {
      const route = [
        { lat: 50.0, lon: 8.0 },
        { lat: 50.1, lon: 8.1 },
        { lat: 50.1, lon: 8.0 },
        { lat: 50.0, lon: 8.1 },
        { lat: 50.0, lon: 8.0 }
      ];

      const optimized = twoOptOptimize(route, 1); // Only 1 iteration
      expect(optimized).toHaveLength(route.length);
    });

    it('does not modify original route', () => {
      const route = [
        { lat: 50.0, lon: 8.0 },
        { lat: 50.1, lon: 8.1 },
        { lat: 50.1, lon: 8.0 },
        { lat: 50.0, lon: 8.1 },
        { lat: 50.0, lon: 8.0 }
      ];

      const original = [...route];
      twoOptOptimize(route);
      expect(route).toEqual(original);
    });
  });
});
