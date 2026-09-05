"use strict";

/**
 * Native tab-group auto-grouping rules (local engine, no AI).
 * A rule matches when every provided criterion passes:
 *   domain       — comma-separated suffix match on the tab hostname
 *   urlIncludes  — substring of the tab URL
 *   titleIncludes— substring of the tab title (case-insensitive)
 *   regex        — RegExp tested against the URL (invalid regex disables it)
 * Unmatched tabs fall back to root-domain grouping when enabled.
 */

var TabRules = (function () {
  var MODEL_VERSION = 1;
  var COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
  var idCounter = 0;

  function makeId() {
    idCounter += 1;
    return "rule-" + Date.now().toString(36) + "-" + idCounter.toString(36);
  }

  function asString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function sanitizeRule(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var color = asString(src.color);
    return {
      id: asString(src.id) || makeId(),
      domain: asString(src.domain),
      urlIncludes: asString(src.urlIncludes),
      titleIncludes: asString(src.titleIncludes),
      regex: asString(src.regex),
      title: asString(src.title),
      color: COLORS.indexOf(color) !== -1 ? color : "grey",
      collapsed: Boolean(src.collapsed),
      order:
        typeof src.order === "number" && isFinite(src.order) ? Math.floor(src.order) : 0,
    };
  }

  function hasCriteria(rule) {
    return Boolean(rule.domain || rule.urlIncludes || rule.titleIncludes || rule.regex);
  }

  function normalize(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var rules = Array.isArray(src.rules) ? src.rules : [];
    var clean = [];
    for (var i = 0; i < rules.length; i++) {
      if (!rules[i] || typeof rules[i] !== "object") continue;
      var rule = sanitizeRule(rules[i]);
      if (hasCriteria(rule)) clean.push(rule);
    }
    return {
      version: MODEL_VERSION,
      fallbackDomain: src.fallbackDomain !== false,
      rules: clean,
    };
  }

  function upsert(list, rule) {
    var model = normalize(list);
    var clean = sanitizeRule(rule);
    if (!hasCriteria(clean)) return model;
    var replaced = false;
    var out = [];
    for (var i = 0; i < model.rules.length; i++) {
      if (model.rules[i].id === clean.id) {
        out.push(clean);
        replaced = true;
      } else {
        out.push(model.rules[i]);
      }
    }
    if (!replaced) out.push(clean);
    out.sort(function (a, b) {
      return a.order - b.order;
    });
    return { version: MODEL_VERSION, fallbackDomain: model.fallbackDomain, rules: out };
  }

  function remove(list, id) {
    var model = normalize(list);
    return {
      version: MODEL_VERSION,
      fallbackDomain: model.fallbackDomain,
      rules: model.rules.filter(function (rule) {
        return rule.id !== id;
      }),
    };
  }

  function hostnameOf(tab) {
    var url = String((tab && tab.url) || "").trim();
    try {
      var u = new URL(url);
      return u.hostname.toLowerCase();
    } catch (err) {
      return "";
    }
  }

  function isGroupable(tab) {
    return /^https?:\/\//i.test(String((tab && tab.url) || ""));
  }

  function compile(rule) {
    var hasCriteria =
      rule.domain || rule.urlIncludes || rule.titleIncludes || rule.regex;
    if (!hasCriteria) return null;
    var domains = rule.domain
      ? rule.domain
          .split(",")
          .map(function (d) {
            return d.trim().toLowerCase();
          })
          .filter(Boolean)
      : [];
    var matcher = null;
    if (rule.regex) {
      try {
        matcher = new RegExp(rule.regex, "i");
      } catch (err) {
        return null;
      }
    }
    return function (tab) {
      if (!isGroupable(tab)) return false;
      if (matcher && !matcher.test(String(tab.url || ""))) return false;
      if (rule.urlIncludes && String(tab.url || "").indexOf(rule.urlIncludes) === -1) {
        return false;
      }
      if (
        rule.titleIncludes &&
        String(tab.title || "").toLowerCase().indexOf(rule.titleIncludes.toLowerCase()) === -1
      ) {
        return false;
      }
      if (domains.length) {
        var host = hostnameOf(tab);
        var hit = false;
        for (var i = 0; i < domains.length; i++) {
          var d = domains[i];
          if (host === d || host.slice(-d.length - 1) === "." + d) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
      return true;
    };
  }

  /** First matching rule for a tab, or null. */
  function firstMatch(model, tab) {
    for (var i = 0; i < model.rules.length; i++) {
      var predicate = compile(model.rules[i]);
      if (predicate && predicate(tab)) return model.rules[i];
    }
    return null;
  }

  /**
   * Grouping plan for a window's tabs: [{title, color, collapsed, tabIds}].
   * Tabs without a rule go into root-domain groups when fallbackDomain is on,
   * and stay ungrouped otherwise. Order follows first appearance.
   */
  function planGroups(listOrModel, tabs) {
    var model = normalize(listOrModel);
    var plans = Object.create(null);
    var order = [];

    function planFor(key, kind, title, color, collapsed) {
      if (!plans[key]) {
        plans[key] = {
          kind: kind,
          title: title,
          color: color,
          collapsed: collapsed,
          tabIds: [],
        };
        order.push(key);
      }
      return plans[key];
    }

    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if (!isGroupable(tab)) continue;
      var rule = firstMatch(model, tab);
      if (rule) {
        planFor("rule:" + rule.id, "rule", rule.title, rule.color, rule.collapsed).tabIds.push(
          tab.id
        );
        continue;
      }
      if (model.fallbackDomain) {
        var host = hostnameOf(tab);
        if (host) {
          planFor("domain:" + host, "domain", host, "grey", false).tabIds.push(tab.id);
        }
      }
    }

    return order.map(function (key) {
      return plans[key];
    });
  }

  return {
    COLORS: COLORS,
    compile: compile,
    firstMatch: firstMatch,
    makeId: makeId,
    normalize: normalize,
    planGroups: planGroups,
    remove: remove,
    sanitizeRule: sanitizeRule,
    upsert: upsert,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = TabRules;
}
