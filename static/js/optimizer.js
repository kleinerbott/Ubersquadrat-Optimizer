export function optimizeSquare(base, targetNew, direction, visitedSet, LAT_STEP, LON_STEP, originLat, originLon, optimizationMode = 'balanced', maxHoleSize = 5) {
  const size = `${base.maxI - base.minI + 1}×${base.maxJ - base.minJ + 1}`;
  console.log(`\n=== OPTIMIZER === Ubersquadrat: ${size}, Visited: ${visitedSet.size}, Mode: ${optimizationMode}`);

  function rectFromIJ(i,j){
    const s = originLat + i * LAT_STEP;
    const w = originLon + j * LON_STEP;
    const n = s + LAT_STEP;
    const e = w + LON_STEP;
    return [[s,w],[n,e]];
  }

  // === UTILITY FUNCTIONS ===
  function calculateLayerDistance(i, j) {
    const distI = Math.max(0, Math.max(base.minI - i - 1, i - base.maxI - 1));
    const distJ = Math.max(0, Math.max(base.minJ - j - 1, j - base.maxJ - 1));
    return { distI, distJ, total: distI + distJ };
  }

  function manhattanDistance(p1, p2) {
    return Math.abs(p1.i - p2.i) + Math.abs(p1.j - p2.j);
  }

  function getSearchBounds(radius = 5) {
    return {
      minI: base.minI - radius,
      maxI: base.maxI + radius,
      minJ: base.minJ - radius,
      maxJ: base.maxJ + radius
    };
  }

  function getNeighborKeys(i, j) {
    return [[i-1,j], [i+1,j], [i,j-1], [i,j+1]].map(([ni,nj]) => `${ni},${nj}`);
  }

  function isOnUbersquadratBorder(i, j) {
    return (i === base.maxI+1 && j >= base.minJ-1 && j <= base.maxJ+1) ||
           (i === base.minI-1 && j >= base.minJ-1 && j <= base.maxJ+1) ||
           (j === base.maxJ+1 && i >= base.minI-1 && i <= base.maxI+1) ||
           (j === base.minJ-1 && i >= base.minI-1 && i <= base.maxI+1);
  }

  // Mode-specific scoring multipliers
  const MODE_MULTIPLIERS = {
    edge: { edge: 3, hole: 0.3 },
    holes: { edge: 0.3, hole: 2 },
    balanced: { edge: 1, hole: 1 }
  };

  // === PHASE 1: EDGE ANALYSIS ===
  function analyzeEdge(name, fixedCoord, start, end, type) {
    const squares = [];
    let unvisitedCount = 0;

    for (let k = start; k <= end; k++) {
      const [i, j] = type === 'row' ? [fixedCoord, k] : [k, fixedCoord];
      const key = `${i},${j}`;
      const visited = visitedSet.has(key);

      squares.push({i, j, key, visited});
      if (!visited) unvisitedCount++;
    }

    const total = end - start + 1;
    const visitedCount = total - unvisitedCount;
    const completion = (visitedCount / total) * 100;

    return {
      name,
      squares,
      total,
      unvisitedCount,
      visitedCount,
      completion,
      canExpand: unvisitedCount === 0
    };
  }

  const edges = {
    N: analyzeEdge('N', base.maxI + 1, base.minJ, base.maxJ, 'row'),
    S: analyzeEdge('S', base.minI - 1, base.minJ, base.maxJ, 'row'),
    E: analyzeEdge('E', base.maxJ + 1, base.minI, base.maxI, 'col'),
    W: analyzeEdge('W', base.minJ - 1, base.minI, base.maxI, 'col')
  };

  const expandable = Object.values(edges).filter(e => e.canExpand);
  if (expandable.length > 0) {
    console.log(`Edges: ${expandable.map(e => e.name).join(',')} can expand!`);
  }

  // === PHASE 1.5: HOLE DETECTION ===

  // Helper function: Flood-fill to find contiguous unvisited regions
  function findContiguousRegion(startI, startJ, visited, isInBounds) {
    const region = [];
    const queue = [[startI, startJ]];
    const regionVisited = new Set();
    const startKey = `${startI},${startJ}`;
    regionVisited.add(startKey);

    while (queue.length > 0) {
      const [i, j] = queue.shift();
      const key = `${i},${j}`;

      // Skip if already visited by overall algorithm or in visited set
      if (visited.has(key) || visitedSet.has(key)) continue;
      if (!isInBounds(i, j)) continue;

      region.push({i, j, key});
      visited.add(key);

      // Check 4 neighbors
      const neighborKeys = getNeighborKeys(i, j);
      const neighbors = [[i-1, j], [i+1, j], [i, j-1], [i, j+1]];

      for (let idx = 0; idx < neighbors.length; idx++) {
        const [ni, nj] = neighbors[idx];
        const nKey = neighborKeys[idx];
        if (!regionVisited.has(nKey) && !visitedSet.has(nKey) && isInBounds(ni, nj)) {
          regionVisited.add(nKey);
          queue.push([ni, nj]);
        }
      }
    }

    return region;
  }

  // Detect all holes (contiguous unvisited regions) within search area
  const searchBounds = getSearchBounds(5);
  function isInSearchBounds(i, j) {
    return i >= searchBounds.minI && i <= searchBounds.maxI &&
           j >= searchBounds.minJ && j <= searchBounds.maxJ;
  }

  const holes = [];
  const squareToHoleMap = new Map(); // Maps "i,j" -> hole object
  const processedSquares = new Set();

  // Scan search area to find all holes
  for (let i = searchBounds.minI; i <= searchBounds.maxI; i++) {
    for (let j = searchBounds.minJ; j <= searchBounds.maxJ; j++) {
      const key = `${i},${j}`;

      if (processedSquares.has(key) || visitedSet.has(key)) continue;

      // Found an unvisited square - find its contiguous region
      const region = findContiguousRegion(i, j, processedSquares, isInSearchBounds);

      if (region.length > 0) {
        // Calculate average layer distance for this hole
        let totalLayerDist = 0;
        region.forEach(sq => {
          totalLayerDist += calculateLayerDistance(sq.i, sq.j).total;
        });
        const avgLayer = totalLayerDist / region.length;

        const hole = {
          id: holes.length,
          squares: region,
          size: region.length,
          avgLayer: avgLayer
        };
        holes.push(hole);

        // Map each square to its hole
        region.forEach(sq => {
          squareToHoleMap.set(sq.key, hole);
        });
      }
    }
  }

  const validHoles = holes.filter(h => h.size <= maxHoleSize);
  console.log(`Holes: ${validHoles.length} valid (≤${maxHoleSize}), ${holes.length - validHoles.length} ignored`);

  // Clear and rebuild squareToHoleMap with only valid holes
  squareToHoleMap.clear();
  validHoles.forEach(hole => {
    hole.squares.forEach(sq => {
      squareToHoleMap.set(sq.key, hole);
    });
  });


  // === Step 2: FIND UBERSQUADRAT BORDER LAYER SQUARES ===
  function findPerimeterSquares() {
    const candidates = new Map();
    const bounds = getSearchBounds(5);

    // Check each square in the search area
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        const key = `${i},${j}`;

        // Skip if already visited
        if (visitedSet.has(key)) continue;

        // CRITICAL: Only consider squares OUTSIDE the ubersquadrat
        const positions = {
          N: i > base.maxI,
          S: i < base.minI,
          E: j > base.maxJ,
          W: j < base.minJ
        };

       // Calculate layer distance from ubersquadrat boundary
        const layerDistance = Math.min(
          Math.max(0, i - base.maxI - 1),
          Math.max(0, base.minI - i - 1),
          Math.max(0, j - base.maxJ - 1),
          Math.max(0, base.minJ - j - 1)
        );

        // Only include squares within searchRadius layers from ubersquadrat
        if (layerDistance > 5) continue;

        // Determine which edge based on position relative to ubersquadrat boundary
        const edge = Object.keys(positions).filter(k => positions[k]).join('');

        candidates.set(key, {i, j, edge, key});
      }
    }

    return Array.from(candidates.values());
  }

  // === PHASE 3: GET ALL PERIMETER SQUARES ===
  const allCandidates = findPerimeterSquares();
  const unvisited = allCandidates.filter(c => !visitedSet.has(`${c.i},${c.j}`));
  console.log(`Candidates: ${unvisited.length} unvisited`);

  // === PHASE 4: STRATEGIC SCORING ===

  const scored = unvisited.map(square => {
    let score = 100;

    // === LAYER DISTANCE (Primary factor) ===
    const isBorder = isOnUbersquadratBorder(square.i, square.j);
    const layerDistance = isBorder ? 0 : calculateLayerDistance(square.i, square.j).total;

    // Strongly prioritize proximity with bonuses AND penalties
    if (layerDistance === 0) score += 10000;
    else if (layerDistance === 1) score += 5000;
    else if (layerDistance === 2) score += 2000;
    else if (layerDistance === 3) score += 500;
    else if (layerDistance === 4) score -= 2000;
    else if (layerDistance >= 5) score -= 10000;

    // === EDGE COMPLETION ===
    const maxEdgeCompletion = ['N', 'S', 'E', 'W']
      .filter(dir => square.edge.includes(dir))
      .reduce((max, dir) => Math.max(max, edges[dir].completion), 0);
    let edgeBonus = Math.floor(maxEdgeCompletion * 5);

    // === HOLE FILLING ===
    const squareKey = `${square.i},${square.j}`;
    const hole = squareToHoleMap.get(squareKey);
    let holeSizeBonus = 0;

     if (hole) {
   // Reduce base multiplier: 2000 → 800
   // Apply layer-based reduction
   let holeMultiplier = 800;
   if (layerDistance >= 3) holeMultiplier = 400;  // 50%  
   if (layerDistance >= 5) holeMultiplier = 200;  // 25%  

   holeSizeBonus = hole.size * holeMultiplier;

   // Keep completion bonus but reduce: 3000 → 1500       
   const unvisitedInHole = hole.squares.filter(sq =>      
     !visitedSet.has(sq.key) && sq.key !== squareKey      
   ).length;
   if (unvisitedInHole === 0) score += 1500;
  }

    // === MODE MULTIPLIERS ===
    const mult = MODE_MULTIPLIERS[optimizationMode] || MODE_MULTIPLIERS.balanced;
    edgeBonus = Math.floor(edgeBonus * mult.edge);
    holeSizeBonus = Math.floor(holeSizeBonus * mult.hole);

    score += edgeBonus + holeSizeBonus;

    // === ADJACENCY ===
    const adjacency = getNeighborKeys(square.i, square.j).filter(n => visitedSet.has(n)).length;
    score += adjacency * 25;

    // === DIRECTION FILTER ===
    // direction is now an array of selected directions (e.g., ['N', 'E'])
    if (Array.isArray(direction) && direction.length < 4) {
      // Not all directions selected - apply filtering
      const matches = {
        N: square.i > base.maxI,
        S: square.i < base.minI,
        E: square.j > base.maxJ,
        W: square.j < base.minJ
      };

      // Check if square matches ANY of the selected directions
      const matchesAnyDirection = direction.some(dir => matches[dir]);

      // If doesn't match any selected direction, apply penalty
      if (!matchesAnyDirection) score -= 1000000;
    }
    // If all 4 directions selected or not an array, no filtering (all squares allowed)

    return {...square, score, layerDistance};
  });

  // === Step 5: GREEDY ROUTE SELECTION ===
  const selected = [];
  const remaining = [...scored];

  if (remaining.length === 0) {
    console.log('No candidates available!');
    return [];
  }

  // Select first square (highest score)
  remaining.sort((a, b) => b.score - a.score);
  selected.push(remaining.shift());

  // Greedily select remaining squares (proximity + hole completion)
  while (selected.length < targetNew && remaining.length > 0) {
    const last = selected[selected.length - 1];

    remaining.forEach(sq => {
      const dist = manhattanDistance(sq, last);
      sq.routeScore = sq.score - (dist * 100);

      // Bonus: Complete holes that have started to be filled
      const sqHole = squareToHoleMap.get(`${sq.i},${sq.j}`);
      if (sqHole && selected.some(s => squareToHoleMap.get(`${s.i},${s.j}`)?.id === sqHole.id)) {
        sq.routeScore += 1500;
      }
    });

    remaining.sort((a, b) => b.routeScore - a.routeScore);
    selected.push(remaining.shift());
  }

  console.log(`Selected ${selected.length} squares: ${selected.map(s => `(${s.i},${s.j})`).join(' → ')}`);

  const results = selected.map(s => rectFromIJ(s.i, s.j));
  return results;
}
