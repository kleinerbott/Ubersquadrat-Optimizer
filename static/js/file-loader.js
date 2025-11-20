/**
 * File Loader Module - KML File Loading with LocalStorage Caching
 *
 * Provides file loading via File System Access API (modern browsers)
 * with fallback to traditional file input. Caches last loaded KML
 * in LocalStorage for auto-reload on next visit.
 */

const STORAGE_KEY_FILENAME = 'squadrats_last_kml_filename';
const STORAGE_KEY_CONTENT = 'squadrats_last_kml_content';

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported() {
  return 'showOpenFilePicker' in window;
}

/**
 * Load KML file using File System Access API (modern browsers)
 * @returns {Promise<{filename: string, content: string}>}
 */
export async function loadKmlWithFilePicker() {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{
        description: 'KML Files',
        accept: {
          'application/vnd.google-earth.kml+xml': ['.kml'],
          'application/xml': ['.kml']
        }
      }],
      multiple: false,
      excludeAcceptAllOption: false
    });

    const file = await fileHandle.getFile();
    const content = await file.text();

    // Cache in LocalStorage
    saveToCache(file.name, content);

    return {
      filename: file.name,
      content: content
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('File selection cancelled');
    }
    throw error;
  }
}

/**
 * Load KML file using traditional file input (fallback)
 * @returns {Promise<{filename: string, content: string}>}
 */
export function loadKmlWithFileInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kml,application/vnd.google-earth.kml+xml';

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const content = await file.text();

        // Cache in LocalStorage
        saveToCache(file.name, content);

        resolve({
          filename: file.name,
          content: content
        });
      } catch (error) {
        reject(error);
      }
    };

    input.oncancel = () => {
      reject(new Error('File selection cancelled'));
    };

    input.click();
  });
}

/**
 * Load KML file (auto-detect best method)
 * @returns {Promise<{filename: string, content: string}>}
 */
export async function loadKmlFile() {
  if (isFileSystemAccessSupported()) {
    return await loadKmlWithFilePicker();
  } else {
    return await loadKmlWithFileInput();
  }
}

/**
 * Save KML to LocalStorage cache
 * @param {string} filename
 * @param {string} content
 */
function saveToCache(filename, content) {
  try {
    localStorage.setItem(STORAGE_KEY_FILENAME, filename);
    localStorage.setItem(STORAGE_KEY_CONTENT, content);
    console.log(`Cached KML file: ${filename} (${(content.length / 1024).toFixed(1)} KB)`);
  } catch (error) {
    console.warn('Failed to cache KML in LocalStorage:', error);
  }
}

/**
 * Load cached KML from LocalStorage
 * @returns {{filename: string, content: string} | null}
 */
export function loadCachedKml() {
  try {
    const filename = localStorage.getItem(STORAGE_KEY_FILENAME);
    const content = localStorage.getItem(STORAGE_KEY_CONTENT);

    if (filename && content) {
      console.log(`Loaded cached KML: ${filename} (${(content.length / 1024).toFixed(1)} KB)`);
      return { filename, content };
    }
  } catch (error) {
    console.warn('Failed to load cached KML:', error);
  }

  return null;
}

/**
 * Clear cached KML from LocalStorage
 */
export function clearCache() {
  try {
    localStorage.removeItem(STORAGE_KEY_FILENAME);
    localStorage.removeItem(STORAGE_KEY_CONTENT);
    console.log('Cleared KML cache');
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
}

/**
 * Get cache info (size, filename)
 * @returns {{filename: string | null, size: number}}
 */
export function getCacheInfo() {
  try {
    const filename = localStorage.getItem(STORAGE_KEY_FILENAME);
    const content = localStorage.getItem(STORAGE_KEY_CONTENT);

    return {
      filename: filename,
      size: content ? content.length : 0
    };
  } catch (error) {
    return { filename: null, size: 0 };
  }
}
