/* Shared appearance preference for extension pages. Content scripts only read
   the resulting chrome.storage value; they never inspect a host page's storage. */
var DavflareTheme = (function () {
  "use strict";
  var KEY = "davflare.themeMode";
  function valid(value) {
    return value === "system" || value === "light" || value === "dark";
  }
  function legacyPreference(storage) {
    try {
      var library = storage.getItem("davflare-theme");
      if (library === "light" || library === "dark") return library;
      var drive = JSON.parse(storage.getItem("flaredrive.themeMode") || "null");
      if (valid(drive)) return drive;
    } catch (_) {
      /* storage unavailable or a malformed legacy value */
    }
    return "system";
  }
  function create(options) {
    var preference = "system";
    var listeners = [];
    var revision = 0;
    function effective() {
      return preference === "system"
        ? options.media.matches
          ? "dark"
          : "light"
        : preference;
    }
    function emit() {
      listeners.slice().forEach(function (fn) {
        fn(preference, effective());
      });
    }
    function changed(changes, area) {
      if (area !== "local" || !changes[KEY]) return;
      revision++;
      preference = valid(changes[KEY].newValue)
        ? changes[KEY].newValue
        : "system";
      emit();
    }
    function mediaChanged() {
      if (preference === "system") emit();
    }
    options.changes.addListener(changed);
    options.media.addEventListener("change", mediaChanged);
    var ready = options.storage
      .get([KEY])
      .then(async function (stored) {
        if (revision) return;
        if (valid(stored[KEY])) preference = stored[KEY];
        else {
          preference = legacyPreference(options.legacy);
          await options.storage.set(
            (function () {
              var next = {};
              next[KEY] = preference;
              return next;
            })(),
          );
        }
        emit();
      })
      .catch(function () {
        emit();
      });
    return {
      ready: ready,
      getPreference: function () {
        return preference;
      },
      getEffective: effective,
      setPreference: async function (value) {
        if (!valid(value)) return;
        revision++;
        preference = value;
        emit();
        var next = {};
        next[KEY] = value;
        try {
          await options.storage.set(next);
        } catch (_) {
          /* keep the session preference */
        }
      },
      subscribe: function (fn) {
        listeners.push(fn);
        fn(preference, effective());
        return function () {
          listeners = listeners.filter(function (item) {
            return item !== fn;
          });
        };
      },
      dispose: function () {
        options.changes.removeListener(changed);
        options.media.removeEventListener("change", mediaChanged);
        listeners = [];
      },
    };
  }
  var api = { KEY: KEY, create: create, legacyPreference: legacyPreference };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (
    typeof chrome !== "undefined" &&
    chrome.storage &&
    typeof window !== "undefined"
  ) {
    var legacy;
    try {
      legacy = window.localStorage;
    } catch (_) {
      legacy = {
        getItem: function () {
          return null;
        },
      };
    }
    var controller = create({
      storage: chrome.storage.local,
      changes: chrome.storage.onChanged,
      media: window.matchMedia("(prefers-color-scheme: dark)"),
      legacy: legacy,
    });
    controller.subscribe(function (_, theme) {
      document.documentElement.dataset.theme = theme;
    });
    return Object.assign(api, controller);
  }
  return api;
})();
