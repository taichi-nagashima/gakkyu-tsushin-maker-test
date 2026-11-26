(function (global) {
  'use strict';

  var DB_NAME = 'home_newsletter_photos_v1';
  var DB_VERSION = 1;
  var STORE_NAME = 'photos';
  var IDB_PREFIX = 'idb://';
  var dbPromise = null;

  function isAvailable() {
    try {
      return typeof global.indexedDB !== 'undefined' && global.indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  function openDB() {
    if (!isAvailable()) {
      return Promise.resolve(null);
    }
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve) {
      try {
        var req = global.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (event) {
          try {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          } catch (e) {
            // ignore upgrade error; handled by fallback
          }
        };
        req.onsuccess = function (event) {
          var db = event.target.result;
          db.onclose = function () {
            dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = function () {
          dbPromise = null;
          resolve(null);
        };
        req.onblocked = function () {
          dbPromise = null;
          resolve(null);
        };
      } catch (e) {
        dbPromise = null;
        resolve(null);
      }
    });
    return dbPromise;
  }

  function savePhoto(id, dataUrl) {
    if (!id || typeof dataUrl !== 'string' || !isAvailable()) {
      return Promise.resolve(false);
    }
    return openDB().then(function (db) {
      if (!db) {
        return false;
      }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          var req = store.put(dataUrl, String(id));
          req.onsuccess = function () {
            resolve(true);
          };
          req.onerror = function () {
            resolve(false);
          };
          tx.onabort = function () {
            resolve(false);
          };
        } catch (e) {
          resolve(false);
        }
      });
    }).catch(function () {
      return false;
    });
  }

  function loadPhoto(id) {
    if (!id || !isAvailable()) {
      return Promise.resolve(null);
    }
    return openDB().then(function (db) {
      if (!db) {
        return null;
      }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var store = tx.objectStore(STORE_NAME);
          var req = store.get(String(id));
          req.onsuccess = function (event) {
            var result = event.target.result;
            if (typeof result === 'string' && result.length > 0) {
              resolve(result);
            } else if (result && typeof result.dataUrl === 'string' && result.dataUrl.length > 0) {
              resolve(result.dataUrl);
            } else {
              resolve(null);
            }
          };
          req.onerror = function () {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    }).catch(function () {
      return null;
    });
  }

  function deletePhoto(id) {
    if (!id || !isAvailable()) {
      return Promise.resolve(false);
    }
    return openDB().then(function (db) {
      if (!db) {
        return false;
      }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          var req = store.delete(String(id));
          req.onsuccess = function () {
            resolve(true);
          };
          req.onerror = function () {
            resolve(false);
          };
          tx.onabort = function () {
            resolve(false);
          };
        } catch (e) {
          resolve(false);
        }
      });
    }).catch(function () {
      return false;
    });
  }

  function cloneState(state) {
    if (!state || typeof state !== 'object') {
      return state;
    }
    try {
      return JSON.parse(JSON.stringify(state));
    } catch (e) {
      return Object.assign({}, state);
    }
  }

  function externalizeStatePhotos(state) {
    var cloned = cloneState(state);
    if (!cloned || typeof cloned !== 'object' || !Array.isArray(cloned.photos) || !isAvailable()) {
      return Promise.resolve(cloned);
    }

    var tasks = cloned.photos.map(function (photo, index) {
      if (!photo || typeof photo !== 'object' || typeof photo.dataUrl !== 'string') {
        return Promise.resolve(photo);
      }
      if (photo.dataUrl.indexOf('data:image/') !== 0) {
        return Promise.resolve(photo);
      }
      var id = photo.id ? String(photo.id) : ('photo_' + index + '_' + Date.now());
      return savePhoto(id, photo.dataUrl).then(function (saved) {
        if (!saved) {
          return photo;
        }
        return Object.assign({}, photo, {
          id: id,
          dataUrl: IDB_PREFIX + id
        });
      }).catch(function () {
        return photo;
      });
    });

    return Promise.all(tasks).then(function (nextPhotos) {
      cloned.photos = nextPhotos;
      return cloned;
    }).catch(function () {
      return cloneState(state);
    });
  }

  function hydrateStatePhotos(state) {
    var cloned = cloneState(state);
    if (!cloned || typeof cloned !== 'object' || !Array.isArray(cloned.photos) || !isAvailable()) {
      return Promise.resolve(cloned);
    }

    var tasks = cloned.photos.map(function (photo) {
      if (!photo || typeof photo !== 'object' || typeof photo.dataUrl !== 'string') {
        return Promise.resolve(photo);
      }
      if (photo.dataUrl.indexOf(IDB_PREFIX) !== 0) {
        return Promise.resolve(photo);
      }
      var id = photo.dataUrl.slice(IDB_PREFIX.length);
      if (!id) {
        return Promise.resolve(photo);
      }
      return loadPhoto(id).then(function (dataUrl) {
        if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
          return photo;
        }
        return Object.assign({}, photo, {
          dataUrl: dataUrl
        });
      }).catch(function () {
        return photo;
      });
    });

    return Promise.all(tasks).then(function (nextPhotos) {
      cloned.photos = nextPhotos;
      return cloned;
    }).catch(function () {
      return cloneState(state);
    });
  }

  global.HomePhotoStore = Object.freeze({
    isAvailable: isAvailable,
    savePhoto: savePhoto,
    loadPhoto: loadPhoto,
    deletePhoto: deletePhoto,
    externalizeStatePhotos: externalizeStatePhotos,
    hydrateStatePhotos: hydrateStatePhotos
  });
})(typeof window !== 'undefined' ? window : this);
