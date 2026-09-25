"use strict";

/**
 * In-page edge save panel (round 4, ham_home-style interaction).
 *
 * Injected as a DYNAMIC content script: nothing runs on a site until the
 * user enables that origin from the popup (background.js registers one
 * content script whose matches list mirrors the enabled origins). The panel
 * never talks to WebDAV itself — it sends `davflare-edge-save` to the
 * service worker, which runs the shared quickSave pipeline and answers with
 * {ok, status, kind, message} so the panel is the single feedback surface.
 *
 * Style isolation: everything lives in a closed shadow root with its own
 * token palette (mirrors tokens.css; dark follows prefers-color-scheme —
 * content scripts cannot read the library page's localStorage theme).
 *
 * Classic script, no framework. Re-injection (executeScript on a tab that
 * loaded before registration) is a no-op that just re-opens the panel.
 */

(function () {
  if (window.__davflareEdgePanelLoaded) {
    window.__davflareEdgePanelToggle(true);
    return;
  }
  window.__davflareEdgePanelLoaded = true;

  var COPY = {
    en: {
      openPanel: "Open the Davflare save panel",
      panelTitle: "Save to Davflare",
      titleLabel: "Title",
      urlLabel: "URL",
      folderLabel: "Folder",
      folderPlaceholder: "Unfiled",
      tagsLabel: "Tags (comma separated)",
      noteLabel: "Note",
      save: "Save",
      saving: "Saving…",
      inTrash: "In the trash — saving restores it with its folder, tags and note.",
      needConfigHint: "Configure your instance in the popup first.",
      sideLabel: "Side",
      sideLeft: "Left",
      sideRight: "Right",
      close: "Close",
      sendFailed: "Could not reach the extension. Try again.",
    },
    zh: {
      openPanel: "打开 Davflare 收藏面板",
      panelTitle: "收藏到 Davflare",
      titleLabel: "标题",
      urlLabel: "URL",
      folderLabel: "文件夹",
      folderPlaceholder: "未分类",
      tagsLabel: "标签（逗号分隔）",
      noteLabel: "备注",
      save: "收藏",
      saving: "收藏中…",
      inTrash: "该页面在回收站中，收藏后将恢复原书签（保留分类、标签和备注）。",
      needConfigHint: "请先在弹窗里配置实例地址。",
      sideLabel: "停靠",
      sideLeft: "左",
      sideRight: "右",
      close: "关闭",
      sendFailed: "无法连接扩展，请重试。",
    },
  };
  var t = COPY[(navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en"];

  var SUCCESS_COLOR = "#2e7d4f";
  var ERROR_COLOR = "#c4472c";

  var CSS_TEXT =
    ":host{all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;" +
    "pointer-events:none;" +
    /* token palette mirrored from tokens.css (light) */
    "--edge-paper:#ffffff;--edge-text:#1a1714;--edge-muted:rgba(26,23,20,0.64);" +
    "--edge-line:rgba(28,22,16,0.08);--edge-line-strong:rgba(28,22,16,0.14);" +
    "--edge-orange:#f38020;--edge-orange-soft:rgba(243,128,32,0.12);" +
    "--edge-field:#faf8f4;--edge-shadow:0 4px 8px rgba(26,23,20,0.06),0 24px 56px rgba(26,23,20,0.18);" +
    "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}" +
    "@media (prefers-color-scheme:dark){:host{" +
    "--edge-paper:#221e17;--edge-text:#f0ece4;--edge-muted:rgba(240,236,228,0.6);" +
    "--edge-line:rgba(240,236,228,0.13);--edge-line-strong:rgba(240,236,228,0.2);" +
    "--edge-orange:#f79b45;--edge-orange-soft:rgba(247,155,69,0.16);" +
    "--edge-field:#191611;--edge-shadow:0 4px 8px rgba(0,0,0,0.35),0 24px 56px rgba(0,0,0,0.55);}}" +
    "*{box-sizing:border-box;pointer-events:auto;}" +
    ".handle{position:fixed;top:40%;width:40px;height:40px;border-radius:50%;border:none;" +
    "background:var(--edge-orange);color:#fff;cursor:pointer;display:flex;align-items:center;" +
    "justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2),0 10px 28px rgba(0,0,0,0.24);" +
    "transition:transform 160ms cubic-bezier(0.2,0.7,0.3,1);padding:0;}" +
    ".handle:hover{transform:scale(1.08);}" +
    ".handle svg{width:20px;height:20px;display:block;}" +
    ".panel{position:fixed;top:calc(40% - 20px);width:288px;max-width:calc(100vw - 32px);" +
    "max-height:calc(100vh - 48px);overflow-y:auto;background:var(--edge-paper);" +
    "color:var(--edge-text);border:1px solid var(--edge-line);border-radius:16px;" +
    "box-shadow:var(--edge-shadow);padding:14px;opacity:0;visibility:hidden;" +
    "transform:translateX(12px);transition:opacity 160ms cubic-bezier(0.2,0.7,0.3,1)," +
    "transform 160ms cubic-bezier(0.2,0.7,0.3,1),visibility 160ms;}" +
    ".open .panel{opacity:1;visibility:visible;transform:translateX(0);}" +
    ".right .handle{right:14px;}" +
    ".right .panel{right:62px;}" +
    ".left .handle{left:14px;}" +
    ".left .panel{left:62px;transform:translateX(-12px);}" +
    ".left.open .panel{transform:translateX(0);}" +
    ".panelHead{display:flex;align-items:center;justify-content:space-between;" +
    "margin-bottom:10px;}" +
    ".panelTitle{font-size:13px;font-weight:600;margin:0;display:flex;align-items:center;gap:6px;}" +
    ".panelTitle svg{width:14px;height:14px;color:var(--edge-orange);flex:none;}" +
    ".panelClose{border:none;background:none;color:var(--edge-muted);cursor:pointer;" +
    "font-size:16px;line-height:1;padding:2px 6px;border-radius:8px;}" +
    ".panelClose:hover{color:var(--edge-text);background:var(--edge-orange-soft);}" +
    ".fieldLabel{display:block;font-size:11px;color:var(--edge-muted);margin:8px 2px 3px;}" +
    ".fieldInput,.fieldArea{width:100%;background:var(--edge-field);color:var(--edge-text);" +
    "border:1px solid var(--edge-line);border-radius:10px;padding:7px 9px;font-size:12px;" +
    "font-family:inherit;outline:none;}" +
    ".fieldInput:focus,.fieldArea:focus{border-color:var(--edge-orange);" +
    "box-shadow:0 0 0 3px var(--edge-orange-soft);}" +
    ".fieldArea{resize:vertical;min-height:44px;}" +
    ".status{font-size:11px;margin:8px 2px 0;min-height:14px;line-height:1.4;}" +
    ".status.ok{color:" + SUCCESS_COLOR + ";}" +
    ".status.err{color:" + ERROR_COLOR + ";}" +
    ".status.trash{color:var(--edge-muted);}" +
    ".panelFoot{display:flex;align-items:center;justify-content:space-between;" +
    "margin-top:10px;gap:8px;}" +
    ".sideGroup{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--edge-muted);}" +
    ".sideBtn{border:1px solid var(--edge-line);background:none;color:var(--edge-muted);" +
    "border-radius:8px;font-size:11px;padding:3px 8px;cursor:pointer;}" +
    ".sideBtn:hover{border-color:var(--edge-line-strong);color:var(--edge-text);}" +
    ".sideBtn.active{background:var(--edge-orange-soft);border-color:var(--edge-orange);" +
    "color:var(--edge-orange);font-weight:600;}" +
    ".saveBtn{background:var(--edge-orange);color:#fff;border:none;border-radius:10px;" +
    "font-size:12px;font-weight:600;padding:7px 16px;cursor:pointer;}" +
    ".saveBtn:hover{filter:brightness(1.05);}" +
    ".saveBtn[disabled]{opacity:0.6;cursor:default;}" +
    "@media (prefers-reduced-motion:reduce){.handle,.panel{transition:none !important;}}";

  var BOOKMARK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4.2L6 21V4.5z" fill="currentColor"/>' +
    "</svg>";

  var host = document.createElement("div");
  host.id = "davflare-edge-panel-host";
  var shadow = host.attachShadow({ mode: "closed" });
  var style = document.createElement("style");
  style.textContent = CSS_TEXT;
  shadow.appendChild(style);

  var wrap = document.createElement("div");
  wrap.className = "right";
  shadow.appendChild(wrap);

  var handle = document.createElement("button");
  handle.type = "button";
  handle.className = "handle";
  handle.setAttribute("aria-label", t.openPanel);
  handle.title = t.openPanel;
  handle.innerHTML = BOOKMARK_SVG;
  wrap.appendChild(handle);

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", t.panelTitle);
  wrap.appendChild(panel);

  var head = document.createElement("div");
  head.className = "panelHead";
  var titleEl = document.createElement("p");
  titleEl.className = "panelTitle";
  titleEl.innerHTML = BOOKMARK_SVG;
  titleEl.appendChild(document.createTextNode(t.panelTitle));
  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "panelClose";
  closeBtn.setAttribute("aria-label", t.close);
  closeBtn.textContent = "×";
  head.appendChild(titleEl);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  function field(labelText, input) {
    var label = document.createElement("label");
    label.className = "fieldLabel";
    label.textContent = labelText;
    panel.appendChild(label);
    panel.appendChild(input);
    return input;
  }

  function makeInput(listId) {
    var input = document.createElement("input");
    input.className = "fieldInput";
    input.type = "text";
    input.spellcheck = false;
    if (listId) input.setAttribute("list", listId);
    return input;
  }

  function makeDatalist(id) {
    var dl = document.createElement("datalist");
    dl.id = id;
    panel.appendChild(dl);
    return dl;
  }

  var titleInput = field(t.titleLabel, makeInput());
  var urlInput = field(t.urlLabel, makeInput());
  var folderInput = field(t.folderLabel, makeInput("davflare-edge-folders"));
  var folderList = makeDatalist("davflare-edge-folders");
  var tagsInput = field(t.tagsLabel, makeInput("davflare-edge-tags"));
  var tagsList = makeDatalist("davflare-edge-tags");
  var noteArea = document.createElement("textarea");
  noteArea.className = "fieldArea";
  noteArea.rows = 3;
  noteArea.spellcheck = false;
  field(t.noteLabel, noteArea);

  var statusEl = document.createElement("p");
  statusEl.className = "status";
  statusEl.setAttribute("role", "status");
  panel.appendChild(statusEl);

  var foot = document.createElement("div");
  foot.className = "panelFoot";
  var sideGroup = document.createElement("span");
  sideGroup.className = "sideGroup";
  sideGroup.appendChild(document.createTextNode(t.sideLabel));
  var leftBtn = document.createElement("button");
  leftBtn.type = "button";
  leftBtn.className = "sideBtn";
  leftBtn.textContent = t.sideLeft;
  var rightBtn = document.createElement("button");
  rightBtn.type = "button";
  rightBtn.className = "sideBtn";
  rightBtn.textContent = t.sideRight;
  sideGroup.appendChild(leftBtn);
  sideGroup.appendChild(rightBtn);
  var saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "saveBtn";
  saveBtn.textContent = t.save;
  foot.appendChild(sideGroup);
  foot.appendChild(saveBtn);
  panel.appendChild(foot);

  var side = "right";
  var open = false;
  var metaFetched = false;
  var collapseTimer = null;

  function setSide(next) {
    side = next === "left" ? "left" : "right";
    wrap.classList.toggle("left", side === "left");
    wrap.classList.toggle("right", side === "right");
    leftBtn.classList.toggle("active", side === "left");
    rightBtn.classList.toggle("active", side === "right");
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function fillDatalist(dl, values) {
    dl.textContent = "";
    for (var i = 0; i < values.length; i++) {
      var opt = document.createElement("option");
      opt.value = values[i];
      dl.appendChild(opt);
    }
  }

  function send(message, onDone) {
    try {
      chrome.runtime.sendMessage(message, function (reply) {
        var err = chrome.runtime.lastError;
        onDone(err ? null : reply);
      });
    } catch (err) {
      onDone(null);
    }
  }

  function refreshTitle() {
    if (!titleInput.value) titleInput.value = document.title || "";
    if (!urlInput.value) urlInput.value = location.href;
  }

  function applyMeta(meta) {
    fillDatalist(folderList, (meta && meta.folders) || []);
    fillDatalist(tagsList, (meta && meta.tags) || []);
    if (meta && meta.trashed) {
      if (!folderInput.value) folderInput.value = meta.trashed.folder || "";
      if (!tagsInput.value) tagsInput.value = (meta.trashed.tags || []).join(", ");
      if (!noteArea.value) noteArea.value = meta.trashed.note || "";
      setStatus(t.inTrash, "trash");
    } else if (meta && meta.configured === false) {
      setStatus(t.needConfigHint, "err");
    }
  }

  function fetchMeta() {
    send({ type: "davflare-edge-meta", url: location.href }, function (meta) {
      if (meta) applyMeta(meta);
    });
  }

  function openPanel() {
    if (open) return;
    open = true;
    wrap.classList.add("open");
    refreshTitle();
    if (!metaFetched) {
      metaFetched = true;
      fetchMeta();
    } else {
      refreshTitle();
    }
    if (collapseTimer) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
    setTimeout(function () {
      try {
        titleInput.focus();
        titleInput.select();
      } catch (err) {
        /* detached */
      }
    }, 60);
  }

  function closePanel() {
    if (!open) return;
    open = false;
    wrap.classList.remove("open");
  }

  window.__davflareEdgePanelToggle = function (show) {
    if (show) openPanel();
    else if (open) closePanel();
    else openPanel();
  };

  function collapseSoon() {
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = setTimeout(function () {
      collapseTimer = null;
      closePanel();
    }, 1600);
  }

  function save() {
    var url = urlInput.value.trim();
    if (!url) {
      setStatus(t.sendFailed, "err");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = t.saving;
    setStatus("", "");
    var tags = tagsInput.value
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    send(
      {
        type: "davflare-edge-save",
        title: titleInput.value.trim(),
        url: url,
        folder: folderInput.value.trim().replace(/^\/+|\/+$/g, ""),
        tags: tags,
        note: noteArea.value.trim(),
      },
      function (reply) {
        saveBtn.disabled = false;
        saveBtn.textContent = t.save;
        if (!reply) {
          setStatus(t.sendFailed, "err");
          return;
        }
        if (reply.ok && reply.status !== "exists") {
          setStatus(reply.message, "ok");
          try {
            chrome.storage.local.set({ popupLastFolder: folderInput.value.trim() });
          } catch (err) {
            /* best-effort */
          }
          collapseSoon();
        } else {
          // exists / conflict / network … — keep the form so the user can retry
          setStatus(reply.message, reply.ok ? "" : "err");
        }
      }
    );
  }

  handle.addEventListener("click", function () {
    if (open) closePanel();
    else openPanel();
  });
  closeBtn.addEventListener("click", closePanel);
  saveBtn.addEventListener("click", save);
  leftBtn.addEventListener("click", function () {
    setSide("left");
    try {
      chrome.storage.sync.set({ edgePanelSide: "left" });
    } catch (err) {
      /* best-effort */
    }
  });
  rightBtn.addEventListener("click", function () {
    setSide("right");
    try {
      chrome.storage.sync.set({ edgePanelSide: "right" });
    } catch (err) {
      /* best-effort */
    }
  });
  // Escape closes the panel before it closes whatever else — capture phase so
  // the page never sees it while the panel is open.
  document.addEventListener(
    "keydown",
    function (event) {
      if (open && event.key === "Escape") {
        event.stopPropagation();
        closePanel();
      }
    },
    true
  );

  try {
    chrome.storage.sync.get(["edgePanelSide"], function (stored) {
      if (stored && (stored.edgePanelSide === "left" || stored.edgePanelSide === "right")) {
        setSide(stored.edgePanelSide);
      }
    });
  } catch (err) {
    /* defaults to right */
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === "davflare-edge-toggle") {
      window.__davflareEdgePanelToggle();
    }
  });

  document.documentElement.appendChild(host);
})();
