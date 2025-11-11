export function optimizeSquare(base, targetNew, direction, visitedSet, LAT_STEP, LON_STEP, originLat, originLon, optimizationMode = 'balanced', maxHoleSize = 5) {
  console.log('\n=== SMART UBERSQUADRAT EXPANSION OPTIMIZER ===');
  console.log('Current ubersquadrat: ' + (base.maxI - base.minI + 1) + '×' + (base.maxJ - base.minJ + 1) +
              ' (grid indices i=[' + base.minI + ',' + base.maxI + '], j=[' + base.minJ + ',' + base.maxJ + '])');
  console.log('Visited squares:', visitedSet.size);
  console.log('Target squares to recommend:', targetNew);
  console.log('Direction preference:', direction);
  console.log('Optimization mode:', optimizationMode);
  console.log('Max hole size:', maxHoleSize);

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

  console.log('\n=== EDGE ANALYSIS ===');
  Object.values(edges).forEach(e => {
    const status = e.canExpand ? ' ✓ CAN EXPAND!' : '';
    console.log(`${e.name}: ${e.completion.toFixed(1)}% complete (${e.unvisitedCount}/${e.total} unvisited)${status}`);
  });

  // Find expandable edges
  const expandableEdges = Object.values(edges).filter(e => e.canExpand);
  if (expandableEdges.length > 0) {
    console.log('\n🎯 EXPANSION OPPORTUNITY: Ubersquadrat can grow on ' + expandableEdges.map(e => e.name).join(', ') + ' edge(s)!');
  }

  // Find best edge by completion
  const edgesByCompletion = Object.values(edges).sort((a, b) => b.completion - a.completion);

  // === PHASE 1.5: HOLE AND CLUSTER DETECTION ===
  console.log('\n=== HOLE & CLUSTER DETECTION ===');

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

  console.log(`Found ${holes.length} total unvisited region(s)`);
  holes.forEach(hole => {
    console.log(`  Region ${hole.id}: ${hole.size} square(s), avg layer ${hole.avgLayer.toFixed(1)}`);
  });

  // Filter holes by max size (ignore massive unexplored regions)
  const validHoles = holes.filter(h => h.size <= maxHoleSize);
  const ignoredRegions = holes.filter(h => h.size > maxHoleSize);

  console.log(`\nHole filtering (max size: ${maxHoleSize}):`);
  console.log(`  Valid holes (≤${maxHoleSize}): ${validHoles.length}`);
  console.log(`  Ignored large regions (>${maxHoleSize}): ${ignoredRegions.length}`);

  // Clear and rebuild squareToHoleMap with only valid holes
  squareToHoleMap.clear();
  validHoles.forEach(hole => {
    hole.squares.forEach(sq => {
      squareToHoleMap.set(sq.key, hole);
    });
  });

  // Detect largest clusters from valid holes (size >= 3)
  const clusters = validHoles.filter(h => h.size >= 3).sort((a, b) => b.size - a.size);
  console.log(`Found ${clusters.length} cluster(s) (valid holes with size >= 3)`);

  // === PHASE 2: FIND UBERSQUADRAT BORDER LAYER SQUARES ===
  function findPerimeterSquares() {
    const candidates = new Map(); // Use map to avoid duplicates
    const bounds = getSearchBounds(5);

    console.log('Searching for ubersquadrat border layers:', bounds.minI, 'to', bounds.maxI, ',', bounds.minJ, 'to', bounds.maxJ);

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

    console.log('Found', candidates.size, 'ubersquadrat border layer squares');

    return Array.from(candidates.values());
  }

  // === PHASE 3: GET ALL PERIMETER SQUARES ===
  const allCandidates = findPerimeterSquares();
  console.log('\nFound', allCandidates.length, 'perimeter candidates');

  // Remove already visited squares
  const unvisited = allCandidates.filter(c => !visitedSet.has(`${c.i},${c.j}`));
  console.log('Unvisited candidates:', unvisited.length);

  // === PHASE 4: STRATEGIC SCORING (UBERSQUADRAT-FOCUSED) ===
  console.log('\n=== STRATEGIC SCORING ===');

  const scored = unvisited.map(square => {
    let score = 100; // Base score
    const scoreBreakdown = ['Base: 100'];

    // === PRIMARY FACTOR: UBERSQUADRAT BORDER LAYER ===
    // Calculate TRUE layer distance from ubersquadrat
    const isBorder = isOnUbersquadratBorder(square.i, square.j);
    const layerDistance = isBorder ? 0 : calculateLayerDistance(square.i, square.j).total;

    // MASSIVE LAYER BONUSES (dominate all other factors)
    if (layerDistance === 0) {
      score += 5000;
      scoreBreakdown.push('Ubersquadrat border (layer 0): +5000');
    } else if (layerDistance === 1) {
      score += 2500;
      scoreBreakdown.push('Layer 1 from border: +2500');
    } else if (layerDistance === 2) {
      score += 1000;
      scoreBreakdown.push('Layer 2 from border: +1000');
    }

    // === SECONDARY FACTOR: EDGE COMPLETION ===
    const edgeName = square.edge || '';
    const maxEdgeCompletion = ['N', 'S', 'E', 'W']
      .filter(dir => square.edge.includes(dir))
      .reduce((max, dir) => Math.max(max, edges[dir].completion), 0);

    let edgeBonus = Math.floor(maxEdgeCompletion * 5);

    // === TERTIARY FACTOR: HOLE SIZE BONUS ===
    // Check if this square is part of a detected hole
    const squareKey = `${square.i},${square.j}`;
    const hole = squareToHoleMap.get(squareKey);

    let holeSizeBonus = 0;
    if (hole) {
      // Linear scaling based on hole size: holeSize × 2000
      holeSizeBonus = hole.size * 2000;

      // === HOLE COMPLETION BONUS ===
      // Check if filling this square would complete the entire hole
      // A hole is "completable" if all its squares except this one would be visited
      let wouldCompleteHole = true;
      let unvisitedInHole = 0;

      for (const holeSquare of hole.squares) {
        if (!visitedSet.has(holeSquare.key) && holeSquare.key !== squareKey) {
          unvisitedInHole++;
          wouldCompleteHole = false;
        }
      }

      if (wouldCompleteHole && unvisitedInHole === 0) {
        const completionBonus = 3000;
        score += completionBonus;
        scoreBreakdown.push(`Completes hole ${hole.id}: +${completionBonus}`);
      }
    }

    // === MODE-SPECIFIC SCORING MULTIPLIERS ===
    const mult = MODE_MULTIPLIERS[optimizationMode] || MODE_MULTIPLIERS.balanced;
    edgeBonus = Math.floor(edgeBonus * mult.edge);
    holeSizeBonus = Math.floor(holeSizeBonus * mult.hole);

    if (mult.edge !== 1 && edgeBonus > 0)
      scoreBreakdown.push(`${optimizationMode} mode: edge ×${mult.edge}`);
    if (mult.hole !== 1 && holeSizeBonus > 0)
      scoreBreakdown.push(`${optimizationMode} mode: hole ×${mult.hole}`);

    // Add bonuses to score (after mode multipliers applied)
    score += edgeBonus;
    score += holeSizeBonus;
    if (edgeBonus > 0) {
      scoreBreakdown.push(`Edge ${edgeName} (${maxEdgeCompletion.toFixed(1)}%): +${edgeBonus}`);
    }
    if (holeSizeBonus > 0) {
      scoreBreakdown.push(`Hole size ${hole.size}: +${holeSizeBonus}`);
    }

    // === CLUSTER PROXIMITY BONUS ===
    if (clusters.length > 0) {
      let minDistanceToCluster = Infinity;
      let nearestCluster = null;

      for (const cluster of clusters) {
        for (const clusterSquare of cluster.squares) {
          const dist = manhattanDistance(square, clusterSquare);
          if (dist < minDistanceToCluster) {
            minDistanceToCluster = dist;
            nearestCluster = cluster;
          }
        }
      }

      const clusterProximityBonus = Math.max(0, 1000 - (minDistanceToCluster * 100));
      if (clusterProximityBonus > 0) {
        score += clusterProximityBonus;
        scoreBreakdown.push(`Near cluster ${nearestCluster.id} (size ${nearestCluster.size}, dist ${minDistanceToCluster}): +${clusterProximityBonus}`);
      }
    }

    // === ADJACENCY BONUS ===
    const visitedNeighbors = getNeighborKeys(square.i, square.j).filter(n => visitedSet.has(n)).length;
    const adjacencyBonus = visitedNeighbors * 25;
    score += adjacencyBonus;
    scoreBreakdown.push(`Adjacency (${visitedNeighbors} neighbors): +${adjacencyBonus}`);

    // === DIRECTION FILTER (HARD CONSTRAINT) ===
    if (direction !== 'all') {
      const directionChecks = {
        N: square.i > base.maxI,
        S: square.i < base.minI,
        E: square.j > base.maxJ,
        W: square.j < base.minJ
      };

      if (!directionChecks[direction]) {
        score -= 1000000;
        scoreBreakdown.push('Direction mismatch: -1000000');
      }
    }

    return {...square, score, scoreBreakdown, edgeName, layerDistance};
  });

  // === PHASE 5: ROUTE-OPTIMIZED SELECTION ===
  // Select squares that form an efficient route (minimize travel distance)
  const selected = [];
  const remaining = [...scored];

  if (remaining.length === 0) {
    console.log('No candidates available!');
    return [];
  }

  // Select first square (highest score overall)
  remaining.sort((a, b) => b.score - a.score);
  selected.push(remaining.shift());

  // Select subsequent squares prioritizing proximity, clustering, and hole completion
  while (selected.length < targetNew && remaining.length > 0) {
    const lastSquare = selected[selected.length - 1];

    // Score remaining squares by proximity to last selected square + clustering bonuses
    remaining.forEach(sq => {
      const distance = manhattanDistance(sq, lastSquare);
      let routeScore = sq.score - (distance * 150); // -150 points per square distance

      // === CLUSTERING BONUS: Prefer squares adjacent to already-selected squares ===
      const adjacentToSelected = selected.filter(s => manhattanDistance(sq, s) === 1).length;
      const clusteringBonus = adjacentToSelected * 500;
      routeScore += clusteringBonus;

      // === HOLE COMPLETION ROUTE BONUS ===
      // Check if we've already selected squares from this hole
      const sqHole = squareToHoleMap.get(`${sq.i},${sq.j}`);
      if (sqHole) {
        let selectedFromSameHole = 0;
        for (const selectedSq of selected) {
          const selectedHole = squareToHoleMap.get(`${selectedSq.i},${selectedSq.j}`);
          if (selectedHole && selectedHole.id === sqHole.id) {
            selectedFromSameHole++;
          }
        }

        // If we've started filling this hole, prioritize finishing it
        if (selectedFromSameHole > 0) {
          const holeCompletionRouteBonus = 2000;
          routeScore += holeCompletionRouteBonus;
        }
      }

      sq.routeScore = routeScore;
      sq.clusteringBonus = clusteringBonus;
    });

    // Select closest high-scoring square
    remaining.sort((a, b) => b.routeScore - a.routeScore);
    selected.push(remaining.shift());
  }

  // === PHASE 6: ENHANCED LOGGING ===
  if (edgesByCompletion[0].unvisitedCount > 0) {
    console.log('\n=== EXPANSION STRATEGY ===');
    console.log('Priority: Complete ' + edgesByCompletion[0].name + ' edge (' + edgesByCompletion[0].unvisitedCount + ' square(s) remaining)');
    if (edgesByCompletion[1].unvisitedCount > 0 && edgesByCompletion[1].completion > 50) {
      console.log('Secondary: Complete ' + edgesByCompletion[1].name + ' edge (' + edgesByCompletion[1].unvisitedCount + ' square(s) remaining)');
    }
  }

  console.log('\n=== OPTIMIZED ROUTE ===');
  selected.forEach((s, idx) => {
    let routeInfo = '';
    let routeBonusInfo = '';

    if (idx > 0) {
      const prev = selected[idx - 1];
      const dist = manhattanDistance(s, prev);
      routeInfo = ` (${dist} squares from previous)`;

      // Add route bonus information
      if (s.clusteringBonus > 0) {
        routeBonusInfo += `, clustering: +${s.clusteringBonus}`;
      }
    }

    const holeInfo = squareToHoleMap.get(`${s.i},${s.j}`);
    const holeId = holeInfo ? ` hole=${holeInfo.id}` : '';

    console.log(`${idx+1}. Square (${s.i},${s.j}) layer=${s.layerDistance} edge=${s.edgeName}${holeId} score=${s.score.toFixed(0)}${routeInfo}${routeBonusInfo}`);
    console.log('   ' + s.scoreBreakdown.join(', '));
  });

  const results = selected.map(s => rectFromIJ(s.i, s.j));
  return results;
}
