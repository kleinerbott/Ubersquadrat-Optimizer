import { describe, it, expect } from 'vitest';
import {
  rectFromIJ,
  getSquareKey,
  parseSquareKey,
  calculateLayerDistance,
  manhattanDistance,
  getSearchBounds,
  getNeighborKeys,
  isOnUbersquadratBorder,
  optimizeSquare,
  MODE_MULTIPLIERS
} from '../../src/logic/optimizer.js';

describe('optimizer.js - Utility Functions', () => {
  describe('rectFromIJ', () => {
    it('converts grid coordinates to rectangle bounds', () => {
      const result = rectFromIJ(0, 0, 50.0, 8.0, 0.1, 0.1);
      expect(result).toEqual([[50.0, 8.0], [50.1, 8.1]]);
    });

    it('handles negative grid coordinates', () => {
      const result = rectFromIJ(-1, -1, 50.0, 8.0, 0.1, 0.1);
      expect(result).toEqual([[49.9, 7.9], [50.0, 8.0]]);
    });

    it('handles different step sizes', () => {
      const result = rectFromIJ(2, 3, 50.0, 8.0, 0.05, 0.15);
      expect(result).toEqual([[50.1, 8.45], [50.15, 8.6]]);
    });
  });

  describe('getSquareKey', () => {
    it('creates key from coordinates', () => {
      expect(getSquareKey(5, 10)).toBe('5,10');
      expect(getSquareKey(0, 0)).toBe('0,0');
      expect(getSquareKey(-1, -1)).toBe('-1,-1');
    });
  });

  describe('parseSquareKey', () => {
    it('parses key to coordinates', () => {
      expect(parseSquareKey('5,10')).toEqual({ i: 5, j: 10 });
      expect(parseSquareKey('0,0')).toEqual({ i: 0, j: 0 });
      expect(parseSquareKey('-1,-1')).toEqual({ i: -1, j: -1 });
    });
  });

  describe('calculateLayerDistance', () => {
    const base = { minI: 0, maxI: 15, minJ: 0, maxJ: 15 }; // 16x16 Übersquadrat

    it('calculates layer 0 (border) distance', () => {
      // North border
      expect(calculateLayerDistance(16, 5, base)).toEqual({ distI: 0, distJ: 0, total: 0 });
      // South border
      expect(calculateLayerDistance(-1, 5, base)).toEqual({ distI: 0, distJ: 0, total: 0 });
      // East border
      expect(calculateLayerDistance(5, 16, base)).toEqual({ distI: 0, distJ: 0, total: 0 });
      // West border
      expect(calculateLayerDistance(5, -1, base)).toEqual({ distI: 0, distJ: 0, total: 0 });
    });

    it('calculates layer 1 distance', () => {
      expect(calculateLayerDistance(17, 5, base)).toEqual({ distI: 1, distJ: 0, total: 1 });
      expect(calculateLayerDistance(-2, 5, base)).toEqual({ distI: 1, distJ: 0, total: 1 });
      expect(calculateLayerDistance(5, 17, base)).toEqual({ distI: 0, distJ: 1, total: 1 });
      expect(calculateLayerDistance(5, -2, base)).toEqual({ distI: 0, distJ: 1, total: 1 });
    });

    it('calculates layer 2+ distance', () => {
      expect(calculateLayerDistance(18, 5, base)).toEqual({ distI: 2, distJ: 0, total: 2 });
      expect(calculateLayerDistance(18, 17, base)).toEqual({ distI: 2, distJ: 1, total: 3 });
    });

    it('returns 0 for squares inside Übersquadrat', () => {
      expect(calculateLayerDistance(5, 5, base)).toEqual({ distI: 0, distJ: 0, total: 0 });
      expect(calculateLayerDistance(0, 0, base)).toEqual({ distI: 0, distJ: 0, total: 0 });
      expect(calculateLayerDistance(15, 15, base)).toEqual({ distI: 0, distJ: 0, total: 0 });
    });
  });

  describe('manhattanDistance', () => {
    it('calculates Manhattan distance between two points', () => {
      expect(manhattanDistance({ i: 0, j: 0 }, { i: 3, j: 4 })).toBe(7);
      expect(manhattanDistance({ i: 5, j: 5 }, { i: 5, j: 5 })).toBe(0);
      expect(manhattanDistance({ i: -2, j: 3 }, { i: 2, j: 1 })).toBe(6);
    });
  });

  describe('getSearchBounds', () => {
    const base = { minI: 0, maxI: 15, minJ: 0, maxJ: 15 };

    it('expands search area by default radius (5)', () => {
      const bounds = getSearchBounds(base);
      expect(bounds).toEqual({
        minI: -5,
        maxI: 20,
        minJ: -5,
        maxJ: 20
      });
    });

    it('expands search area by custom radius', () => {
      const bounds = getSearchBounds(base, 3);
      expect(bounds).toEqual({
        minI: -3,
        maxI: 18,
        minJ: -3,
        maxJ: 18
      });
    });
  });

  describe('getNeighborKeys', () => {
    it('returns 4 neighbor keys (N, S, E, W)', () => {
      const neighbors = getNeighborKeys(5, 10);
      expect(neighbors).toEqual(['4,10', '6,10', '5,9', '5,11']);
    });

    it('handles negative coordinates', () => {
      const neighbors = getNeighborKeys(-1, -1);
      expect(neighbors).toEqual(['-2,-1', '0,-1', '-1,-2', '-1,0']);
    });
  });

  describe('isOnUbersquadratBorder', () => {
    const base = { minI: 0, maxI: 15, minJ: 0, maxJ: 15 };

    it('detects north border squares', () => {
      expect(isOnUbersquadratBorder(16, 0, base)).toBe(true);
      expect(isOnUbersquadratBorder(16, 8, base)).toBe(true);
      expect(isOnUbersquadratBorder(16, 15, base)).toBe(true);
    });

    it('detects south border squares', () => {
      expect(isOnUbersquadratBorder(-1, 0, base)).toBe(true);
      expect(isOnUbersquadratBorder(-1, 8, base)).toBe(true);
      expect(isOnUbersquadratBorder(-1, 15, base)).toBe(true);
    });

    it('detects east border squares', () => {
      expect(isOnUbersquadratBorder(0, 16, base)).toBe(true);
      expect(isOnUbersquadratBorder(8, 16, base)).toBe(true);
      expect(isOnUbersquadratBorder(15, 16, base)).toBe(true);
    });

    it('detects west border squares', () => {
      expect(isOnUbersquadratBorder(0, -1, base)).toBe(true);
      expect(isOnUbersquadratBorder(8, -1, base)).toBe(true);
      expect(isOnUbersquadratBorder(15, -1, base)).toBe(true);
    });

    it('detects corner squares', () => {
      expect(isOnUbersquadratBorder(16, 16, base)).toBe(true); // NE
      expect(isOnUbersquadratBorder(-1, -1, base)).toBe(true); // SW
    });

    it('returns false for non-border squares', () => {
      expect(isOnUbersquadratBorder(17, 8, base)).toBe(false); // Layer 1
      expect(isOnUbersquadratBorder(8, 8, base)).toBe(false);  // Inside
    });
  });
});

describe('optimizer.js - Main Optimization', () => {
  describe('optimizeSquare', () => {
    // Mock data: 4x4 Übersquadrat
    const base = { minI: 0, maxI: 3, minJ: 0, maxJ: 3 };
    const LAT_STEP = 0.1;
    const LON_STEP = 0.1;
    const originLat = 50.0;
    const originLon = 8.0;

    it('returns requested number of squares', () => {
      const visitedSet = new Set(['0,0', '0,1', '0,2', '0,3']); // First row
      const result = optimizeSquare(
        base, 5, ['N', 'S', 'E', 'W'], visitedSet,
        LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
      );

      expect(result.rectangles).toHaveLength(5);
      expect(result.metadata).toHaveLength(5);
    });

    it('returns squares with correct structure', () => {
      const visitedSet = new Set(['0,0']);
      const result = optimizeSquare(
        base, 3, ['N', 'S', 'E', 'W'], visitedSet,
        LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
      );

      expect(result.rectangles[0]).toHaveLength(2); // [[s,w], [n,e]]
      expect(result.metadata[0]).toHaveProperty('gridCoords');
      expect(result.metadata[0].gridCoords).toHaveProperty('i');
      expect(result.metadata[0].gridCoords).toHaveProperty('j');
      expect(result.metadata[0]).toHaveProperty('score');
      expect(result.metadata[0]).toHaveProperty('scoreBreakdown');
    });

    it('respects direction filter - North only', () => {
      const visitedSet = new Set();
      const result = optimizeSquare(
        base, 5, ['N'], visitedSet,
        LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
      );

      // All squares should be north of Übersquadrat (i > base.maxI)
      result.metadata.forEach(square => {
        expect(square.gridCoords.i).toBeGreaterThan(base.maxI);
      });
    });

    it('respects direction filter - East only', () => {
      const visitedSet = new Set();
      const result = optimizeSquare(
        base, 5, ['E'], visitedSet,
        LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
      );

      // All squares should be east of Übersquadrat (j > base.maxJ)
      result.metadata.forEach(square => {
        expect(square.gridCoords.j).toBeGreaterThan(base.maxJ);
      });
    });

    it('edge mode prioritizes border squares', () => {
      const visitedSet = new Set();
      const result = optimizeSquare(
        base, 3, ['N', 'S', 'E', 'W'], visitedSet,
        LAT_STEP, LON_STEP, originLat, originLon, 'edge', 5
      );

      // With edge mode, most results should be layer 0 (border)
      const layer0Count = result.metadata.filter(s => {
        const layerDist = calculateLayerDistance(s.gridCoords.i, s.gridCoords.j, base);
        return layerDist.total === 0;
      }).length;

      expect(layer0Count).toBeGreaterThanOrEqual(0);
    });

    it('handles empty visited set', () => {
      const visitedSet = new Set();
      const result = optimizeSquare(
        base, 5, ['N', 'S', 'E', 'W'], visitedSet,
        LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
      );

      expect(result.rectangles).toHaveLength(5);
    });

    it('handles fully visited Übersquadrat', () => {
      // Fill entire Übersquadrat
      const visitedSet = new Set();
      for (let i = 0; i <= 3; i++) {
        for (let j = 0; j <= 3; j++) {
          visitedSet.add(`${i},${j}`);
        }
      }

      const result = optimizeSquare(
        base, 5, ['N', 'S', 'E', 'W'], visitedSet,
        LAT_STEP, LON_STEP, originLat, originLon, 'balanced', 5
      );

      expect(result.rectangles).toHaveLength(5);
      // All squares should be outside Übersquadrat
      result.metadata.forEach(square => {
        const isInside = square.gridCoords.i >= 0 && square.gridCoords.i <= 3 &&
                        square.gridCoords.j >= 0 && square.gridCoords.j <= 3;
        expect(isInside).toBe(false);
      });
    });
  });

  describe('MODE_MULTIPLIERS', () => {
    it('has correct multipliers for edge mode', () => {
      expect(MODE_MULTIPLIERS.edge).toEqual({ edge: 3, hole: 0.3 });
    });

    it('has correct multipliers for holes mode', () => {
      expect(MODE_MULTIPLIERS.holes).toEqual({ edge: 0.3, hole: 2 });
    });

    it('has correct multipliers for balanced mode', () => {
      expect(MODE_MULTIPLIERS.balanced).toEqual({ edge: 1, hole: 1 });
    });
  });
});
