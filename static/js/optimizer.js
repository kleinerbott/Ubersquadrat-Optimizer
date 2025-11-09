export function optimizeSquare(base, targetNew, direction, visitedSet, LAT_STEP, LON_STEP, originLat, originLon) {
  console.log('\n=== SMART UBERSQUADRAT EXPANSION OPTIMIZER ===');
  console.log('Current ubersquadrat: ' + (base.maxI - base.minI + 1) + '×' + (base.maxJ - base.minJ + 1) +
              ' (grid indices i=[' + base.minI + ',' + base.maxI + '], j=[' + base.minJ + ',' + base.maxJ + '])');
  console.log('Visited squares:', visitedSet.size);
  console.log('Target squares to recommend:', targetNew);
  console.log('Direction preference:', direction);

  function rectFromIJ(i,j){
    const s = originLat + i * LAT_STEP;
    const w = originLon + j * LON_STEP;
    const n = s + LAT_STEP;
    const e = w + LON_STEP;
    return [[s,w],[n,e]];
  }

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

  // === PHASE 2: FIND UBERSQUADRAT BORDER LAYER SQUARES ===
  function findPerimeterSquares() {
    const candidates = new Map(); // Use map to avoid duplicates

    // Search layers around the UBERSQUADRAT only (not random visited squares)
    const searchRadius = 5;
    const searchMinI = base.minI - searchRadius;
    const searchMaxI = base.maxI + searchRadius;
    const searchMinJ = base.minJ - searchRadius;
    const searchMaxJ = base.maxJ + searchRadius;

    console.log('Searching for ubersquadrat border layers:', searchMinI, 'to', searchMaxI, ',', searchMinJ, 'to', searchMaxJ);

    // Check each square in the search area
    for (let i = searchMinI; i <= searchMaxI; i++) {
      for (let j = searchMinJ; j <= searchMaxJ; j++) {
        const key = `${i},${j}`;

        // Skip if already visited
        if (visitedSet.has(key)) continue;

        // CRITICAL: Only consider squares OUTSIDE the ubersquadrat
        const isOutsideNorth = (i > base.maxI);
        const isOutsideSouth = (i < base.minI);
        const isOutsideEast = (j > base.maxJ);
        const isOutsideWest = (j < base.minJ);

        const isOutside = isOutsideNorth || isOutsideSouth || isOutsideEast || isOutsideWest;

        if (!isOutside) continue; // Skip squares inside the ubersquadrat

        // Calculate layer distance from ubersquadrat boundary
        const distNorth = Math.max(0, i - base.maxI - 1);
        const distSouth = Math.max(0, base.minI - i - 1);
        const distEast = Math.max(0, j - base.maxJ - 1);
        const distWest = Math.max(0, base.minJ - j - 1);
        const layerDistance = Math.min(distNorth, distSouth, distEast, distWest);

        // Only include squares within searchRadius layers from ubersquadrat
        if (layerDistance > searchRadius) continue;

        // Determine which edge based on position relative to ubersquadrat boundary
        let edge = '';
        if (isOutsideNorth) edge += 'N';
        if (isOutsideSouth) edge += 'S';
        if (isOutsideEast) edge += 'E';
        if (isOutsideWest) edge += 'W';

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
    // A square is layer 0 ONLY if it's on the immediate border AND within the ubersquadrat's projection

    // Check if on border rows/columns
    const onNorthRow = (square.i === base.maxI + 1);
    const onSouthRow = (square.i === base.minI - 1);
    const onEastCol = (square.j === base.maxJ + 1);
    const onWestCol = (square.j === base.minJ - 1);

    // Check if within ubersquadrat's range (including one square margin for corners)
    const withinJRange = (square.j >= base.minJ - 1 && square.j <= base.maxJ + 1);
    const withinIRange = (square.i >= base.minI - 1 && square.i <= base.maxI + 1);

    // True border detection: on border row/col AND within range
    const onNorthBorder = onNorthRow && withinJRange;
    const onSouthBorder = onSouthRow && withinJRange;
    const onEastBorder = onEastCol && withinIRange;
    const onWestBorder = onWestCol && withinIRange;

    const isOnUbersquadratBorder = onNorthBorder || onSouthBorder || onEastBorder || onWestBorder;

    // Calculate layer distance (Manhattan distance from nearest ubersquadrat point)
    let layerDistance;

    if (isOnUbersquadratBorder) {
      // On immediate border
      layerDistance = 0;
    } else {
      // Calculate distance to nearest ubersquadrat edge
      const distI = Math.max(0, Math.max(base.minI - square.i - 1, square.i - base.maxI - 1));
      const distJ = Math.max(0, Math.max(base.minJ - square.j - 1, square.j - base.maxJ - 1));
      layerDistance = distI + distJ; // Manhattan distance
    }

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
    let maxEdgeCompletion = 0;
    let edgeName = square.edge || '';

    if (square.edge.includes('N')) maxEdgeCompletion = Math.max(maxEdgeCompletion, edges.N.completion);
    if (square.edge.includes('S')) maxEdgeCompletion = Math.max(maxEdgeCompletion, edges.S.completion);
    if (square.edge.includes('E')) maxEdgeCompletion = Math.max(maxEdgeCompletion, edges.E.completion);
    if (square.edge.includes('W')) maxEdgeCompletion = Math.max(maxEdgeCompletion, edges.W.completion);

    const edgeBonus = Math.floor(maxEdgeCompletion * 5);
    score += edgeBonus;
    scoreBreakdown.push(`Edge ${edgeName} (${maxEdgeCompletion.toFixed(1)}%): +${edgeBonus}`);

    // === TERTIARY FACTOR: HOLE FILLING ===
    // Only applies to ubersquadrat border squares (layer 0)
    if (isOnUbersquadratBorder) {
      let fillsHole = false;

      // Check if on immediate north/south border
      if (onNorthBorder || onSouthBorder) {
        const leftNeighbor = `${square.i},${square.j-1}`;
        const rightNeighbor = `${square.i},${square.j+1}`;
        if (visitedSet.has(leftNeighbor) && visitedSet.has(rightNeighbor)) {
          fillsHole = true;
        }
      }

      // Check if on immediate east/west border
      if (onEastBorder || onWestBorder) {
        const topNeighbor = `${square.i+1},${square.j}`;
        const bottomNeighbor = `${square.i-1},${square.j}`;
        if (visitedSet.has(topNeighbor) && visitedSet.has(bottomNeighbor)) {
          fillsHole = true;
        }
      }

      if (fillsHole) {
        score += 2000;
        scoreBreakdown.push('Fills border hole: +2000');
      }
    }

    // === CORNER BONUS ===
    const isCorner = square.edge.length === 2;
    if (isCorner) {
      score += 200;
      scoreBreakdown.push('Corner: +200');

      // Double bonus if both edges are near-complete (>70%)
      const edgeNames = square.edge.split('');
      const edge1 = edges[edgeNames[0]];
      const edge2 = edges[edgeNames[1]];
      if (edge1 && edge2 && edge1.completion > 70 && edge2.completion > 70) {
        score += 200;
        scoreBreakdown.push('Strategic corner (both edges >70%): +200');
      }
    }

    // === ADJACENCY BONUS ===
    const neighbors = [
      `${square.i-1},${square.j}`,
      `${square.i+1},${square.j}`,
      `${square.i},${square.j-1}`,
      `${square.i},${square.j+1}`
    ];
    const visitedNeighbors = neighbors.filter(n => visitedSet.has(n)).length;
    const adjacencyBonus = visitedNeighbors * 25;
    score += adjacencyBonus;
    scoreBreakdown.push(`Adjacency (${visitedNeighbors} neighbors): +${adjacencyBonus}`);

    // === DIRECTION FILTER (HARD CONSTRAINT) ===
    // Match squares in the selected direction across all layers
    if (direction !== 'all') {
      let matchesDirection = false;

      // Match if square is on the selected side, regardless of layer distance
      if (direction === 'N') matchesDirection = (square.i > base.maxI);
      if (direction === 'S') matchesDirection = (square.i < base.minI);
      if (direction === 'E') matchesDirection = (square.j > base.maxJ);
      if (direction === 'W') matchesDirection = (square.j < base.minJ);

      if (!matchesDirection) {
        score -= 10000; // Massive penalty to eliminate wrong directions
        scoreBreakdown.push('Direction mismatch: -10000');
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

  // Select subsequent squares prioritizing proximity to last selected
  while (selected.length < targetNew && remaining.length > 0) {
    const lastSquare = selected[selected.length - 1];

    // Score remaining squares by proximity to last selected square
    remaining.forEach(sq => {
      const distance = Math.abs(sq.i - lastSquare.i) + Math.abs(sq.j - lastSquare.j);
      sq.routeScore = sq.score - (distance * 100); // -100 points per square distance
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
    if (idx > 0) {
      const prev = selected[idx - 1];
      const dist = Math.abs(s.i - prev.i) + Math.abs(s.j - prev.j);
      routeInfo = ` (${dist} squares from previous)`;
    }
    console.log(`${idx+1}. Square (${s.i},${s.j}) layer=${s.layerDistance} edge=${s.edgeName} score=${s.score.toFixed(0)}${routeInfo}`);
    console.log('   ' + s.scoreBreakdown.join(', '));
  });

  const results = selected.map(s => rectFromIJ(s.i, s.j));
  return results;
}
