/**
 * Performance Logger
 *
 * Sammelt Timer-Daten während der Ausführung und ermöglicht Export als JSON-Datei.
 * API ähnlich zu console.time/timeEnd für einfachen Austausch.
 */

class PerformanceLogger {
  constructor() {
    this.timers = new Map(); // Active timers: name -> {start, parent}
    this.measurements = []; // Completed measurements
    this.sessionStart = Date.now();
    this.sessionMetadata = {};
  }

  /**
   * Startet einen Timer
   * @param {string} name - Name des Timers
   */
  time(name) {
    const now = performance.now();

    // Find parent timer (last active timer)
    const activeTimers = Array.from(this.timers.entries());
    const parent = activeTimers.length > 0
      ? activeTimers[activeTimers.length - 1][0]
      : null;

    this.timers.set(name, {
      start: now,
      parent,
      timestamp: new Date().toISOString()
    });

    // Also log to console for development
    console.time(name);
  }

  /**
   * Beendet einen Timer und speichert die Messung
   * @param {string} name - Name des Timers
   */
  timeEnd(name) {
    const now = performance.now();

    if (!this.timers.has(name)) {
      console.warn(`Timer "${name}" was never started`);
      return;
    }

    const timer = this.timers.get(name);
    const duration = now - timer.start;

    this.measurements.push({
      name,
      duration: Math.round(duration * 100) / 100, // Round to 2 decimals
      start: timer.timestamp,
      parent: timer.parent || null
    });

    this.timers.delete(name);

    // Also log to console for development
    console.timeEnd(name);
  }

  /**
   * Setzt Session-Metadaten (z.B. KML-Dateiname)
   * @param {Object} metadata - Metadaten-Objekt
   */
  setMetadata(metadata) {
    this.sessionMetadata = { ...this.sessionMetadata, ...metadata };
  }

  /**
   * Gibt alle gesammelten Daten als strukturiertes Objekt zurück
   * @returns {Object} Performance-Daten mit Metadaten
   */
  getData() {
    // Build hierarchical structure
    const hierarchical = this.buildHierarchy();

    return {
      session: {
        start: new Date(this.sessionStart).toISOString(),
        duration: Math.round((Date.now() - this.sessionStart) / 1000), // seconds
        ...this.sessionMetadata
      },
      measurements: {
        total: this.measurements.length,
        flat: this.measurements,
        hierarchical
      },
      summary: this.calculateSummary()
    };
  }

  /**
   * Baut hierarchische Struktur aus flachen Measurements
   * @returns {Array} Hierarchische Measurements
   */
  buildHierarchy() {
    const byParent = new Map();

    // Group by parent
    this.measurements.forEach(m => {
      const parent = m.parent || 'root';
      if (!byParent.has(parent)) {
        byParent.set(parent, []);
      }
      byParent.get(parent).push(m);
    });

    // Build tree recursively
    const buildTree = (parentName) => {
      const children = byParent.get(parentName) || [];
      return children.map(child => ({
        name: child.name,
        duration: child.duration,
        start: child.start,
        children: buildTree(child.name)
      }));
    };

    return buildTree('root');
  }

  /**
   * Berechnet Zusammenfassung der Performance-Daten
   * @returns {Object} Zusammenfassung
   */
  calculateSummary() {
    if (this.measurements.length === 0) {
      return { totalDuration: 0, count: 0, byName: {} };
    }

    const byName = {};
    let totalDuration = 0;

    this.measurements.forEach(m => {
      totalDuration += m.duration;

      if (!byName[m.name]) {
        byName[m.name] = {
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          minDuration: Infinity,
          maxDuration: -Infinity
        };
      }

      const stat = byName[m.name];
      stat.count++;
      stat.totalDuration += m.duration;
      stat.minDuration = Math.min(stat.minDuration, m.duration);
      stat.maxDuration = Math.max(stat.maxDuration, m.duration);
      stat.avgDuration = stat.totalDuration / stat.count;
    });

    return {
      totalDuration: Math.round(totalDuration),
      count: this.measurements.length,
      byName
    };
  }

  /**
   * Exportiert Daten als JSON-String
   * @returns {string} JSON-String
   */
  exportJSON() {
    return JSON.stringify(this.getData(), null, 2);
  }

  /**
   * Setzt alle Daten zurück
   */
  reset() {
    this.timers.clear();
    this.measurements = [];
    this.sessionStart = Date.now();
    this.sessionMetadata = {};
  }

  /**
   * Gibt aktuelle Statistiken in der Console aus
   */
  logSummary() {
    const data = this.getData();
    console.group('📊 Performance Summary');
    console.log('Session:', data.session);
    console.log('Total Measurements:', data.measurements.total);
    console.log('By Name:', data.summary.byName);
    console.groupEnd();
  }
}

// Singleton instance
const performanceLogger = new PerformanceLogger();

export default performanceLogger;
