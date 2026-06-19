window.RolloReader = (function () {
  const PREFS_KEY = "rolloReaderPrefs";
  const SCROLL_KEY_PREFIX = "rolloReaderScroll:";
  const CHAT_LINE_RE =
    /^(\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\s*-\s*.+?:)\s*(.*)$/i;
  const TEXT_MAX_BYTES = 1024 * 1024;

  const defaults = {
    fontSize: 18,
    lineHeight: 1.75,
    widthSlider: 50,
    font: "sans",
    theme: "default",
    messageSpacing: true,
  };

  function loadPrefs() {
    try {
      const saved = { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
      if (saved.width && saved.widthSlider == null) {
        if (saved.width === "narrow") saved.widthSlider = 20;
        else if (saved.width === "full") saved.widthSlider = 100;
        else saved.widthSlider = 50;
      }
      delete saved.width;
      return saved;
    } catch {
      return { ...defaults };
    }
  }

  function savePrefs(prefs) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }

  function widthLabel(slider) {
    if (slider >= 92) return "Full";
    if (slider <= 28) return "Narrow";
    if (slider <= 62) return "Medium";
    return "Wide";
  }

  function applyWidthSlider(slider, root) {
    if (slider >= 98) {
      root.style.setProperty("--reader-max-width", "none");
      return;
    }
    const rem = 28 + (slider / 100) * 36;
    root.style.setProperty("--reader-max-width", `${rem.toFixed(1)}rem`);
  }

  function applyPrefs(prefs) {
    const root = document.documentElement;
    root.style.setProperty("--reader-font-size", `${prefs.fontSize}px`);
    root.style.setProperty("--reader-line-height", String(prefs.lineHeight));
    root.style.setProperty("--reader-block-gap", `${Math.round(prefs.fontSize * 0.95)}px`);
    root.setAttribute("data-reader-font", prefs.font);
    applyWidthSlider(prefs.widthSlider ?? 50, root);
    if (prefs.theme === "default") root.removeAttribute("data-reader-theme");
    else root.setAttribute("data-reader-theme", prefs.theme);
  }

  function parseChatBlocks(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let current = null;

    for (const line of lines) {
      const match = line.match(CHAT_LINE_RE);
      if (match) {
        if (current) blocks.push(current);
        current = { meta: match[1].replace(/:\s*$/, ""), body: match[2] || "" };
        continue;
      }
      if (!current) {
        current = { meta: "", body: line };
        continue;
      }
      current.body += (current.body ? "\n" : "") + line;
    }
    if (current) blocks.push(current);
    return blocks.filter((b) => b.meta || b.body.trim());
  }

  function renderPlain(el, text) {
    el.className = "reader-plain";
    el.textContent = text;
  }

  function renderBlocks(el, blocks) {
    el.className = "reader-blocks";
    el.replaceChildren();
    blocks.forEach((block) => {
      const wrap = document.createElement("article");
      wrap.className = "reader-block";
      if (block.meta) {
        const meta = document.createElement("div");
        meta.className = "reader-meta";
        meta.textContent = block.meta;
        wrap.appendChild(meta);
      }
      const body = document.createElement("div");
      body.className = "reader-msg";
      body.textContent = block.body || " ";
      wrap.appendChild(body);
      el.appendChild(wrap);
    });
  }

  function renderContent(el, text, prefs) {
    if (prefs.messageSpacing && parseChatBlocks(text).length > 1) {
      renderBlocks(el, parseChatBlocks(text));
    } else {
      renderPlain(el, text);
    }
  }

  function readerUrl(video, groupId, back) {
    groupId = groupId || video?.group || VideoGroups.getActive();
    const params = new URLSearchParams();
    if (groupId) params.set("group", groupId);
    if (video?.name) params.set("file", video.name);
    if (back) params.set("back", back);
    return `/rolloreader.html?${params.toString()}`;
  }

  function backUrl(params) {
    const group = params.get("group");
    const back = params.get("back");
    const qs = group ? `?group=${encodeURIComponent(group)}` : "";
    if (back === "feed") {
      const file = params.get("file");
      const feed = new URLSearchParams();
      if (group) feed.set("group", group);
      if (file) feed.set("video", file);
      return feed.toString() ? `/watch.html?${feed}` : `/watch.html${qs}`;
    }
    return `/${qs}`;
  }

  function bindPanel(panel, backdrop, toggles, doneBtn) {
    const body = document.body;

    function setOpen(open) {
      toggles.forEach((btn) => btn.setAttribute("aria-expanded", open ? "true" : "false"));
      body.classList.toggle("panel-open", open);
      if (open) {
        panel.hidden = false;
        backdrop.hidden = false;
        requestAnimationFrame(() => {
          panel.classList.add("open");
          backdrop.classList.add("open");
        });
        return;
      }
      panel.classList.remove("open");
      backdrop.classList.remove("open");
      window.setTimeout(() => {
        panel.hidden = true;
        backdrop.hidden = true;
      }, 280);
    }

    function toggle() {
      setOpen(!panel.classList.contains("open"));
    }

    toggles.forEach((btn) => btn.addEventListener("click", toggle));
    backdrop.addEventListener("click", () => setOpen(false));
    doneBtn?.addEventListener("click", () => setOpen(false));

    return { setOpen, toggle };
  }

  function clearFindMarks(root) {
    if (!root) return;
    root.querySelectorAll("mark.reader-find-mark").forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    root.normalize?.();
  }

  function highlightAll(root, query) {
    const marks = [];
    const q = query.trim();
    if (!root || !q) return marks;

    const qLower = q.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !node.nodeValue || parent.closest("mark.reader-find-mark")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const text = node.nodeValue;
      const lower = text.toLowerCase();
      let start = 0;
      let index = lower.indexOf(qLower, start);
      if (index === -1) continue;

      const fragments = [];
      let lastEnd = 0;
      while (index !== -1) {
        if (index > lastEnd) {
          fragments.push(document.createTextNode(text.slice(lastEnd, index)));
        }
        const mark = document.createElement("mark");
        mark.className = "reader-find-mark";
        mark.textContent = text.slice(index, index + q.length);
        fragments.push(mark);
        marks.push(mark);
        lastEnd = index + q.length;
        start = lastEnd;
        index = lower.indexOf(qLower, start);
      }
      if (lastEnd < text.length) {
        fragments.push(document.createTextNode(text.slice(lastEnd)));
      }
      const parent = node.parentNode;
      fragments.forEach((fragment) => parent.insertBefore(fragment, node));
      parent.removeChild(node);
    }

    return marks;
  }

  function getScrollParent(el) {
    let node = el?.parentElement;
    while (node && node !== document.documentElement) {
      const { overflowY } = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(overflowY)) return node;
      node = node.parentElement;
    }
    return document.querySelector(".reader-scroll-host") || document.scrollingElement;
  }

  function scrollToMark(mark) {
    if (!mark?.isConnected) return;

    const headerEl = document.querySelector(".reader-header");
    const headerOffset = (headerEl?.getBoundingClientRect().height || 0) + 8;
    const host = document.querySelector(".reader-scroll-host");
    const scroller = mark.ownerDocument !== document ? host : getScrollParent(mark) || host;
    if (!scroller) return;

    const jump = () => {
      const rect = mark.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      scroller.scrollTop = Math.max(0, scroller.scrollTop + rect.top - box.top - headerOffset);
    };

    jump();
    requestAnimationFrame(jump);
  }

  function ensureIframeFindStyles(doc) {
    if (!doc || doc.getElementById("rollo-find-style")) return;
    const style = doc.createElement("style");
    style.id = "rollo-find-style";
    style.textContent =
      "mark.reader-find-mark{background:rgba(255,214,10,.45);color:inherit;border-radius:2px;padding:0 1px}" +
      "mark.reader-find-mark.reader-find-current{background:rgba(255,149,0,.85);outline:2px solid #6eb5ff;outline-offset:1px}";
    doc.head?.appendChild(style);
  }

  function bindFind({ scrollEl, getSearchRoot, findBtn, findBar, input, countEl, prevBtn, nextBtn, closeBtn }) {
    const fabLabel = document.getElementById("reader-find-fab-label");
    let marks = [];
    let index = 0;
    let active = false;
    let expanded = false;
    let scrollFromFind = false;
    let collapseTimer = null;

    function updateCount() {
      if (!countEl) return;
      if (!marks.length) {
        countEl.textContent = input?.value.trim() ? "No matches" : "";
        return;
      }
      countEl.textContent = `${index + 1} / ${marks.length}`;
    }

    function updateFabLabel() {
      if (!fabLabel) return;
      const query = input?.value || "";
      if (active && !expanded && query.trim()) {
        fabLabel.hidden = false;
        if (marks.length) {
          fabLabel.textContent = `${query} · ${index + 1}/${marks.length}`;
        } else {
          fabLabel.textContent = query;
        }
        findBtn?.classList.add("has-session");
        return;
      }
      fabLabel.hidden = true;
      fabLabel.textContent = "";
      if (!expanded) findBtn?.classList.remove("has-session");
    }

    function syncFindUi() {
      updateCount();
      updateFabLabel();
    }

    function showMatch(at, { scroll = true } = {}) {
      if (!marks.length) return;
      index = ((at % marks.length) + marks.length) % marks.length;
      marks.forEach((mark, i) => {
        mark.classList.toggle("reader-find-current", i === index);
      });
      syncFindUi();
      if (!scroll) return;
      scrollFromFind = true;
      requestAnimationFrame(() => {
        scrollToMark(marks[index]);
        window.setTimeout(() => {
          scrollFromFind = false;
        }, 120);
      });
    }

    function search({ preserveIndex = false } = {}) {
      const root = getSearchRoot();
      const query = (input?.value || "").trim();
      const prevIndex = preserveIndex ? index : 0;
      clearFindMarks(root);
      marks = [];
      index = 0;

      if (!root || !query) {
        syncFindUi();
        return;
      }

      if (root.ownerDocument !== document) {
        ensureIframeFindStyles(root.ownerDocument);
      }

      marks = highlightAll(root, query);
      if (marks.length) {
        showMatch(preserveIndex ? Math.min(prevIndex, marks.length - 1) : 0);
      } else {
        syncFindUi();
      }
    }

    function clearSearch() {
      clearFindMarks(getSearchRoot());
      marks = [];
      index = 0;
      syncFindUi();
    }

    function go(delta) {
      if (!marks.length) return;
      showMatch(index + delta);
    }

    function expand() {
      active = true;
      expanded = true;
      clearTimeout(collapseTimer);
      findBtn?.setAttribute("aria-expanded", "true");
      document.body.classList.add("reader-find-open");
      document.body.classList.remove("reader-find-collapsed");
      findBtn?.classList.remove("has-session");
      if (findBar) findBar.hidden = false;

      const query = input?.value.trim();
      if (marks.length && marks[0]?.isConnected) {
        marks.forEach((mark, i) => {
          mark.classList.toggle("reader-find-current", i === index);
        });
        syncFindUi();
      } else if (query) {
        search();
      } else {
        syncFindUi();
      }

      requestAnimationFrame(() => findBar?.classList.add("open"));
      requestAnimationFrame(() => {
        input?.focus();
        if (input?.value) input.setSelectionRange(input.value.length, input.value.length);
      });
    }

    function collapse() {
      if (!active || !expanded) return;
      expanded = false;
      findBtn?.setAttribute("aria-expanded", "false");
      document.body.classList.remove("reader-find-open");
      document.body.classList.add("reader-find-collapsed");
      findBar?.classList.remove("open");
      clearTimeout(collapseTimer);
      collapseTimer = window.setTimeout(() => {
        updateFabLabel();
      }, 280);
      updateFabLabel();
    }

    function dismiss() {
      active = false;
      expanded = false;
      clearTimeout(collapseTimer);
      findBtn?.setAttribute("aria-expanded", "false");
      document.body.classList.remove("reader-find-open", "reader-find-collapsed");
      findBtn?.classList.remove("has-session");
      findBar?.classList.remove("open");
      window.setTimeout(() => {
        if (findBar) findBar.hidden = true;
      }, 280);
      if (input) input.value = "";
      clearSearch();
    }

    function onFabClick() {
      if (expanded) {
        collapse();
        return;
      }
      if (active) {
        expand();
        return;
      }
      active = true;
      expand();
    }

    if (scrollEl) {
      scrollEl.addEventListener(
        "scroll",
        () => {
          if (scrollFromFind || !expanded) return;
          collapse();
        },
        { passive: true }
      );
    }

    findBtn?.addEventListener("click", onFabClick);
    closeBtn?.addEventListener("click", () => dismiss());
    prevBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      go(-1);
    });
    nextBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      go(1);
    });
    input?.addEventListener("input", () => search());

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    });

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (active && !expanded) expand();
        else if (!active) {
          active = true;
          expand();
        } else {
          input?.focus();
          input?.select();
        }
      }
    });

    return {
      refresh: () => {
        if (active && input?.value.trim()) search({ preserveIndex: true });
      },
      clear: dismiss,
      setOpen: (open) => {
        if (open) {
          if (!active) active = true;
          expand();
        } else {
          dismiss();
        }
      },
    };
  }

  function bindControls(prefs, contentEl, rawText, scrollEl, onContentChange) {
    const fontSizeSlider = document.getElementById("reader-font-size");
    const lineHeightSlider = document.getElementById("reader-line-height");
    const widthSlider = document.getElementById("reader-width");
    const fontSizeVal = document.getElementById("reader-font-size-val");
    const lineHeightVal = document.getElementById("reader-line-height-val");
    const widthVal = document.getElementById("reader-width-val");
    const fontSelect = document.getElementById("reader-font");
    const themeSelect = document.getElementById("reader-theme");
    const spacingToggle = document.getElementById("reader-message-spacing");

    const syncUi = ({ rerender = false } = {}) => {
      if (fontSizeSlider) fontSizeSlider.value = String(prefs.fontSize);
      if (lineHeightSlider) lineHeightSlider.value = String(Math.round(prefs.lineHeight * 100));
      if (widthSlider) widthSlider.value = String(prefs.widthSlider);
      if (fontSizeVal) fontSizeVal.textContent = `${prefs.fontSize}px`;
      if (lineHeightVal) lineHeightVal.textContent = Number(prefs.lineHeight.toFixed(2)).toString();
      if (widthVal) widthVal.textContent = widthLabel(prefs.widthSlider);
      if (fontSelect) fontSelect.value = prefs.font;
      if (themeSelect) themeSelect.value = prefs.theme;
      if (spacingToggle) spacingToggle.checked = !!prefs.messageSpacing;
      applyPrefs(prefs);
      if (rerender && rawText) {
        const prevScroll = scrollEl?.scrollTop || 0;
        renderContent(contentEl, rawText, prefs);
        if (scrollEl && prevScroll > 0) scrollEl.scrollTop = prevScroll;
      }
      onContentChange?.();
    };

    fontSizeSlider?.addEventListener("input", (e) => {
      prefs.fontSize = Number(e.target.value);
      savePrefs(prefs);
      syncUi({ rerender: true });
    });
    lineHeightSlider?.addEventListener("input", (e) => {
      prefs.lineHeight = Number(e.target.value) / 100;
      savePrefs(prefs);
      syncUi({ rerender: true });
    });
    widthSlider?.addEventListener("input", (e) => {
      prefs.widthSlider = Number(e.target.value);
      savePrefs(prefs);
      syncUi();
    });
    fontSelect?.addEventListener("change", (e) => {
      prefs.font = e.target.value;
      savePrefs(prefs);
      syncUi({ rerender: true });
    });
    themeSelect?.addEventListener("change", (e) => {
      prefs.theme = e.target.value;
      savePrefs(prefs);
      syncUi();
    });
    spacingToggle?.addEventListener("change", (e) => {
      prefs.messageSpacing = e.target.checked;
      savePrefs(prefs);
      syncUi({ rerender: true });
    });

    syncUi({ rerender: true });
  }

  function scrollStorageKey(groupId, filename) {
    return `${SCROLL_KEY_PREFIX}${groupId || ""}/${filename || ""}`;
  }

  function readScrollPosition(groupId, filename) {
    try {
      const saved = Number(localStorage.getItem(scrollStorageKey(groupId, filename)));
      return Number.isFinite(saved) && saved > 0 ? saved : 0;
    } catch {
      return 0;
    }
  }

  function writeScrollPosition(groupId, filename, scrollTop) {
    try {
      const key = scrollStorageKey(groupId, filename);
      if (!scrollTop || scrollTop < 8) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, String(Math.round(scrollTop)));
    } catch {
      /* ignore */
    }
  }

  function bindScrollMemory(scrollEl, groupId, filename) {
    if (!scrollEl || !filename) return;
    let saveTimer = null;

    const restore = () => {
      const top = readScrollPosition(groupId, filename);
      if (top > 0) scrollEl.scrollTop = top;
    };

    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        writeScrollPosition(groupId, filename, scrollEl.scrollTop);
      }, 180);
    };

    scrollEl.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", () => {
      writeScrollPosition(groupId, filename, scrollEl.scrollTop);
    });

    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 120);

    return { restore, saveNow: () => writeScrollPosition(groupId, filename, scrollEl.scrollTop) };
  }

  function bindHtmlIframe(iframe, onResize) {
    const fit = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const height = Math.max(
          doc.documentElement?.scrollHeight || 0,
          doc.body?.scrollHeight || 0,
          doc.documentElement?.offsetHeight || 0
        );
        if (height > 0) {
          iframe.style.height = `${height}px`;
          onResize?.();
        }
      } catch {
        /* ignore */
      }
    };

    iframe.addEventListener("load", () => {
      try {
        ensureIframeFindStyles(iframe.contentDocument);
      } catch {
        /* ignore */
      }
      fit();
      requestAnimationFrame(fit);
      setTimeout(fit, 250);
      setTimeout(fit, 1200);
    });

    if (typeof ResizeObserver !== "undefined") {
      iframe.addEventListener("load", () => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return;
          const ro = new ResizeObserver(fit);
          ro.observe(doc.documentElement);
          if (doc.body) ro.observe(doc.body);
        } catch {
          /* ignore */
        }
      });
    }
  }

  function loadHtmlView(contentEl, scrollHost, groupId, filename, onReady) {
    document.body.classList.add("page-reader-html");
    const mainEl = scrollHost?.querySelector?.("#reader-scroll") || scrollHost;
    if (mainEl) mainEl.classList.add("reader-scroll-html");
    contentEl.hidden = false;
    contentEl.className = "reader-html-wrap";
    contentEl.replaceChildren();
    const iframe = document.createElement("iframe");
    iframe.className = "reader-html-frame";
    iframe.title = MediaHelpers.stripMediaExt(filename);
    iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    const path = `/videos/${encodeURIComponent(groupId)}/${encodeURIComponent(filename)}`;
    iframe.src = VideoGroups.mediaUrl(path, groupId);
    contentEl.appendChild(iframe);
    document.querySelectorAll(".reader-text-only").forEach((el) => {
      el.hidden = true;
    });
    bindHtmlIframe(iframe, onReady);
    return iframe;
  }

  async function initPage() {
    const params = new URLSearchParams(location.search);
    const groupId = params.get("group") || VideoGroups.getActive();
    const filename = params.get("file");
    const backBtn = document.getElementById("reader-back");
    const titleEl = document.getElementById("reader-title");
    const subtitleEl = document.getElementById("reader-subtitle");
    const statusEl = document.getElementById("reader-status");
    const contentEl = document.getElementById("reader-content");
    const scrollEl = document.querySelector(".reader-scroll-host") || document.getElementById("reader-scroll");
    const settingsBtn = document.getElementById("reader-settings-btn");
    const fabBtn = document.getElementById("reader-fab");
    const panel = document.getElementById("reader-panel");
    const backdrop = document.getElementById("reader-panel-backdrop");
    const doneBtn = document.getElementById("reader-panel-done");
    const findBtn = document.getElementById("reader-find-fab");
    const findBar = document.getElementById("reader-find-bar");
    const findInput = document.getElementById("reader-find-input");
    const findCount = document.getElementById("reader-find-count");
    const findPrev = document.getElementById("reader-find-prev");
    const findNext = document.getElementById("reader-find-next");
    const findClose = document.getElementById("reader-find-close");

    if (groupId) VideoGroups.setActive(groupId);

    let scrollMemory = null;
    let htmlIframe = null;
    let findController = null;

    findController = bindFind({
      scrollEl,
      getSearchRoot: () => (htmlIframe?.contentDocument?.body || contentEl),
      findBtn,
      findBar,
      input: findInput,
      countEl: findCount,
      prevBtn: findPrev,
      nextBtn: findNext,
      closeBtn: findClose,
    });

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        scrollMemory?.saveNow?.();
        location.href = backUrl(params);
      });
    }

    bindPanel(panel, backdrop, [settingsBtn, fabBtn].filter(Boolean), doneBtn);

    if (!filename) {
      if (statusEl) {
        statusEl.textContent = "No file selected.";
        statusEl.classList.add("error");
      }
      return;
    }

    if (titleEl) titleEl.textContent = MediaHelpers.stripMediaExt(filename);
    if (subtitleEl) subtitleEl.textContent = filename;

    const prefs = loadPrefs();
    applyPrefs(prefs);

    scrollMemory = bindScrollMemory(scrollEl, groupId, filename);

    if (MediaHelpers.isHtmlFile(filename)) {
      if (statusEl) statusEl.hidden = true;
      htmlIframe = loadHtmlView(contentEl, scrollEl, groupId, filename, () => {
        scrollMemory?.restore?.();
        findController?.refresh?.();
      });
      return;
    }

    try {
      const path = `/videos/${encodeURIComponent(groupId)}/${encodeURIComponent(filename)}`;
      const url = VideoGroups.mediaUrl(path, groupId);
      const res = await fetch(url, { headers: VideoGroups.headers(groupId) });
      if (!res.ok) throw new Error(`Could not load file (${res.status})`);
      let rawText = await res.text();
      if (rawText.length > TEXT_MAX_BYTES) {
        rawText = `${rawText.slice(0, TEXT_MAX_BYTES)}\n\n… (file truncated for performance)`;
      }
      if (statusEl) statusEl.hidden = true;
      contentEl.hidden = false;
      renderContent(contentEl, rawText, prefs);
      bindControls(prefs, contentEl, rawText, scrollEl, () => findController?.refresh?.());
      scrollMemory?.restore?.();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || "Could not load file.";
        statusEl.classList.add("error");
      }
    }
  }

  return { readerUrl, initPage, loadPrefs, applyPrefs };
})();
