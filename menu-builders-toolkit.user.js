// ==UserScript==
// @name         Menu Builders' Toolkit
// @namespace    https://github.com/jooj211/menu-builders-toolkit
// @version      0.1.0
// @description  Helper tools for Popmenu menu builders (modifier tags, etc.)
// @author       Jonatas Dias
// @match        https://my.popmenu.com/*
// @run-at       document-idle
// @grant        none
//
// NOTE: After first push, come back and set @updateURL and @downloadURL:
// @updateURL    https://raw.githubusercontent.com/jooj210/menu-builders-toolkit/main/menu-builders-toolkit.user.js
// @downloadURL  https://raw.githubusercontent.com/jooj210/menu-builders-toolkit/main/menu-builders-toolkit.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Core bootstrap logging ----
  console.log('[MBT] Menu Builders\' Toolkit loaded');

  // Optional: simple guard so it only runs on the menu builder page(s)
  // Adjust this condition to whatever URL patterns you actually use:
  if (!location.pathname.includes('/menus')) {
    console.log('[MBT] Not on menus page, exiting');
    return;
  }

  // ---- Feature 1: Modifier tags on menu items ----
  // Wrap your working “modifier tags” script into a function
  function initModifierTagsFeature() {
    console.log('[MBT] Initializing modifier tag feature');

    "use strict";

    // ------------- shared MBT bootstrap -------------

    const MBT = (window.MBT = window.MBT || {});
    if (MBT._initializedModifierTags) {
      console.log("[MBT] Modifier tags feature already initialized, skipping.");
      return;
    }
    MBT._initializedModifierTags = true;

    console.log("[MBT] Menu Builders' Toolkit loaded. Feature #1: modifier tags.");

    /**
     * Wait until some menu cards exist, then start the feature.
     * This is helpful because the app is React / SPA and content may arrive late.
     */
    function waitForMenuCardsAndInit(retries = 30) {
      const cards = document.querySelectorAll('[data-cy="menu_item_card"]');
      if (cards.length > 0) {
        console.log("[MBT] Found menu cards, starting modifier tags feature.");
        initModifierTagsFeature();
        return;
      }

      if (retries <= 0) {
        console.warn("[MBT] No menu cards detected; modifier tags not started.");
        return;
      }

      setTimeout(() => waitForMenuCardsAndInit(retries - 1), 500);
    }

    // ------------- Feature #1: Modifier tags -------------

    function initModifierTagsFeature() {
      const GRAPHQL_ENDPOINT = "/graphql";
      const csrf =
        document.querySelector('meta[name="csrf-token"]')?.content || null;

      // Cache dish modifierGroups by menuItemId so we don't spam GraphQL.
      const dishCache = new Map();

      // Re-usable GraphQL query for menusDish
      const query = `
        query menusDishModTags($menuItemId: Int!) {
          dish(menuItemId: $menuItemId) {
            id
            name
            modifierGroups {
              id
              name
              minSelectionsCount
              maxSelectionsCount
            }
          }
        }
      `;

      const formatRangeTooltip = (group) => {
        const min = group.minSelectionsCount;
        const max = group.maxSelectionsCount;

        const parts = [];
        if (typeof min === "number") parts.push(`Min: ${min}`);
        if (typeof max === "number") parts.push(`Max: ${max}`);
        return parts.join(" • ");
      };

      async function fetchDishData(menuItemId) {
        if (dishCache.has(menuItemId)) {
          console.log("[MBT][MOD-TAGS] Using cached dish for", menuItemId);
          return dishCache.get(menuItemId);
        }

        const body = {
          operationName: "menusDishModTags",
          query,
          variables: { menuItemId },
        };

        console.log("[MBT][MOD-TAGS] Fetching dish data for", menuItemId, body);

        const resp = await fetch(GRAPHQL_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            ...(csrf ? { "x-csrf-token": csrf } : {}),
          },
          body: JSON.stringify(body),
        });

        console.log(
          "[MBT][MOD-TAGS] Response status for",
          menuItemId,
          resp.status
        );

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const json = await resp.json();
        console.log("[MBT][MOD-TAGS] GraphQL JSON for", menuItemId, json);

        const dish = json?.data?.dish || null;
        dishCache.set(menuItemId, dish);
        return dish;
      }

      async function tagCard(card) {
        try {
          const idAttr = card.id || card.getAttribute("id");
          const match = idAttr && idAttr.match(/^(\d+)-menu-item$/);

          if (!match) {
            console.warn(
              "[MBT][MOD-TAGS] Could not extract menuItemId from",
              idAttr
            );
            return;
          }

          const menuItemId = parseInt(match[1], 10);
          console.log(
            "[MBT][MOD-TAGS] Tagging card for menuItemId",
            menuItemId,
            card
          );

          // Create or clear tag container
          let tagContainer = card.querySelector(".mbt-mod-tag-container");
          if (!tagContainer) {
            const headerContent =
              card.querySelector(".MuiCardHeader-content-2135") || card;

            tagContainer = document.createElement("div");
            tagContainer.className = "mbt-mod-tag-container";
            tagContainer.style.marginTop = "-0.5rem";
            tagContainer.style.paddingBottom = "1rem";
            tagContainer.style.paddingLeft = "1rem";
            tagContainer.style.display = "flex";
            tagContainer.style.flexWrap = "wrap";
            tagContainer.style.gap = "4px";
            tagContainer.style.fontSize = "11px";
            tagContainer.style.alignItems = "center";

            headerContent.appendChild(tagContainer);
          } else {
            tagContainer.textContent = "";
          }

          tagContainer.textContent = "Loading modifiers…";

          const dish = await fetchDishData(menuItemId);
          const modifierGroups = dish?.modifierGroups || [];

          console.log(
            "[MBT][MOD-TAGS] modifierGroups for",
            menuItemId,
            "count:",
            modifierGroups.length,
            modifierGroups
          );

          tagContainer.textContent = "";

          if (!modifierGroups.length) {
            tagContainer.textContent = "No modifiers";
            tagContainer.style.opacity = "0.6";
            return;
          }

          for (const group of modifierGroups) {
            if (!group || !group.name) continue;

            const span = document.createElement("span");
            span.textContent = group.name;
            span.style.border = "1px solid rgba(0,0,0,0.2)";
            span.style.borderRadius = "9999px";
            span.style.padding = "1px 6px";
            span.style.background = "#f5f5f5";
            span.style.whiteSpace = "nowrap";

            const tooltip = formatRangeTooltip(group);
            if (tooltip) {
              span.title = tooltip; // native hover tooltip
            }

            tagContainer.appendChild(span);
          }
        } catch (err) {
          console.error("[MBT][MOD-TAGS] Error tagging card", card, err);
          const existing = card.querySelector(".mbt-mod-tag-container");
          if (existing) {
            existing.textContent = "Tags: error";
            existing.style.opacity = "0.7";
          }
        }
      }

      function scanAndTagAll() {
        const cards = Array.from(
          document.querySelectorAll('[data-cy="menu_item_card"]')
        );
        console.log(
          "[MBT][MOD-TAGS] scanAndTagAll found",
          cards.length,
          "cards"
        );
        cards.forEach((card) => tagCard(card));
      }

      // Initial run
      scanAndTagAll();

      // MutationObserver to handle lazy-loaded items as you scroll
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;

            // Newly added card itself
            if (node.matches?.('[data-cy="menu_item_card"]')) {
              console.log(
                "[MBT][MOD-TAGS] New card node detected",
                node
              );
              tagCard(node);
            }

            // Or cards inside newly added subtree
            const innerCards = node.querySelectorAll?.(
              '[data-cy="menu_item_card"]'
            );
            if (innerCards && innerCards.length) {
              console.log(
                "[MBT][MOD-TAGS] New subtree with",
                innerCards.length,
                "cards detected"
              );
              innerCards.forEach((c) => tagCard(c));
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Expose so you can stop it from console if needed
      MBT.modTagsObserver = observer;

      console.log(
        "[MBT][MOD-TAGS] Modifier tags feature initialized, observer attached."
      );
    }

    // Kick off once content is there
    waitForMenuCardsAndInit();


  }

  // Call the feature init
  initModifierTagsFeature();


  // ---- Toolkit UI: Modes & Image Scanner ----
  function initToolkit() {
    console.log('[MBT] Initializing Toolkit UI');
    const MBT = (window.MBT = window.MBT || {});
    if (MBT._initializedToolkit) return;
    MBT._initializedToolkit = true;

    // --- Constants ---
    const MODES = {
      PASTE: 'paste',
      SCAN: 'scan'
    };

    const KEYS = {
      TOKENS: 'mbt_tokens',
      RAW_TOKENS: 'mbt_raw_tokens',
      INDEX: 'mbt_index',
      MODE: 'mbt_mode'
    };

    // --- State Management ---
    const State = {
      getTokens: () => {
        try { return JSON.parse(localStorage.getItem(KEYS.TOKENS) || '[]'); }
        catch { return []; }
      },
      saveTokens: (t) => localStorage.setItem(KEYS.TOKENS, JSON.stringify(t)),

      getRawTokens: () => {
        try { return JSON.parse(localStorage.getItem(KEYS.RAW_TOKENS) || '[]'); }
        catch { return []; }
      },
      saveRawTokens: (t) => localStorage.setItem(KEYS.RAW_TOKENS, JSON.stringify(t)),

      getIndex: () => parseInt(localStorage.getItem(KEYS.INDEX) || '0', 10),
      saveIndex: (i) => localStorage.setItem(KEYS.INDEX, i),

      getMode: () => localStorage.getItem(KEYS.MODE) || MODES.PASTE,
      saveMode: (m) => localStorage.setItem(KEYS.MODE, m)
    };

    // --- Logic: Cleaning (Ported from fix.py) ---
    const Cleaner = {
      splitCamel: (s) => {
        // "fooBar" -> "foo Bar"
        s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
        s = s.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
        // "Item1" -> "Item 1"
        s = s.replace(/([0-9])([A-Za-z])/g, '$1 $2');
        s = s.replace(/([A-Za-z])([0-9])/g, '$1 $2');
        return s.replace(/[_\-]/g, ' ').replace(/\s+/g, ' ').trim();
      },
      stripExt: (s) => s.replace(/\.[A-Za-z0-9]+$/, ''),
      removeViewSuffixes: (s) => {
        // remove (1), and trailing View names like Top, Side, Straight
        // We loop until no changes to catch "TopStraight"
        let current = s.replace(/\(\d+\)$/, '').trim();
        while (true) {
          const next = current.replace(/(?:Top|Straight|Macro|Side|Angle|\d{1,3})$/i, '').replace(/[ _\-]+$/, '');
          if (next === current) break;
          current = next;
        }
        return current;
      },
      clean: (raw) => {
        let s = Cleaner.stripExt(raw);
        s = Cleaner.removeViewSuffixes(s);
        s = Cleaner.splitCamel(s);
        return s.replace(/^\W*\d+\W*/, '').trim(); // drop leading numbers/symbols
      }
    };

    // --- Helper: Paste ---
    async function smartPaste(text) {
      if (!text) return;
      const active = document.activeElement;

      // Feature: Select all before pasting (replacement behavior)
      if (active) {
        if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
          active.select();
        } else if (active.isContentEditable) {
          document.execCommand('selectAll', false, null);
        }
      }

      const success = document.execCommand('insertText', false, text);
      if (!success) {
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          // If execCommand failed, do manual replacement
          active.value = text;
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          try { await navigator.clipboard.writeText(text); } catch (e) { }
        }
      }
    }

    // --- UI Construction ---
    const fab = document.createElement('button');
    fab.textContent = 'MBT';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '10000',
      padding: '10px 15px', background: '#333', color: 'white',
      border: 'none', borderRadius: '50px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      cursor: 'pointer', fontWeight: 'bold', fontFamily: 'sans-serif'
    });
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', bottom: '80px', right: '20px', zIndex: '10000',
      background: 'white', border: '1px solid #ccc', borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '16px', width: '320px',
      display: 'none', fontFamily: 'sans-serif', maxHeight: '80vh', overflowY: 'auto'
    });
    document.body.appendChild(panel);

    fab.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      if (panel.style.display === 'block') refreshUI();
    });

    function refreshUI() {
      panel.innerHTML = '';

      // Header
      const header = document.createElement('div');
      header.style.marginBottom = '15px';
      header.style.borderBottom = '1px solid #eee';
      header.style.paddingBottom = '10px';
      header.innerHTML = '<strong style="font-size:16px;">Menu Toolkit</strong>';
      panel.appendChild(header);

      // Mode Selector
      const modeRow = document.createElement('div');
      modeRow.style.marginBottom = '15px';
      const modeLabel = document.createElement('label');
      modeLabel.textContent = 'Select Tool: ';
      modeLabel.style.marginRight = '8px';

      const select = document.createElement('select');
      select.innerHTML = `
        <option value="${MODES.PASTE}">Sequential Paste (F2/F4)</option>
        <option value="${MODES.SCAN}">Image Scanner</option>
      `;
      select.value = State.getMode();
      select.onchange = (e) => {
        State.saveMode(e.target.value);
        refreshUI();
      };

      modeRow.appendChild(modeLabel);
      modeRow.appendChild(select);
      panel.appendChild(modeRow);

      const currentMode = State.getMode();

      // --- Render Mode Content ---
      if (currentMode === MODES.PASTE) {
        renderPasteMode();
      } else {
        renderScanMode();
      }

      function renderPasteMode() {
        const desc = document.createElement('div');
        desc.style.fontSize = '12px';
        desc.style.color = '#666';
        desc.style.marginBottom = '10px';
        desc.innerHTML = `
            <strong>F2</strong>: Paste Clean & Next<br/>
            <strong>F4</strong>: Paste Original & Next<br/>
            <span style="color:#888">(Shift+F2/F4: Paste without advancing)</span>
          `;
        panel.appendChild(desc);

        const area = document.createElement('textarea');
        area.style.width = '100%';
        area.style.height = '120px';
        area.style.marginBottom = '8px';
        const tokens = State.getTokens();
        area.value = tokens.join('\n');
        // Warn if user edits manually, raw tokens might break
        area.oninput = () => {
          // We could implement complex syncing but for now let's just save.
        };
        panel.appendChild(area);

        const bar = document.createElement('div');
        bar.style.display = 'flex';
        bar.style.justifyContent = 'space-between';
        bar.style.alignItems = 'center';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save List';
        saveBtn.onclick = () => {
          const lines = area.value.split('\n').filter(x => x.trim());
          State.saveTokens(lines);
          // If user edits manually, we probably should clear Raw tokens or try to keep up
          // For safety/simplicity, let's keep index 0
          State.saveIndex(0);
          refreshUI();
        };
        bar.appendChild(saveBtn);

        const status = document.createElement('span');
        status.style.fontSize = '11px';
        const idx = State.getIndex();
        status.textContent = tokens.length ? `Next: [${idx + 1}/${tokens.length}]` : 'Empty';
        bar.appendChild(status);

        panel.appendChild(bar);
      }

      function renderScanMode() {
        const desc = document.createElement('div');
        desc.style.fontSize = '12px';
        desc.style.color = '#555';
        desc.innerHTML = `
            <p style="margin-top:0"><strong>Workflow:</strong></p>
            <ol style="padding-left:20px; margin:5px 0;">
                <li>Scroll page to load <strong>all</strong> images.</li>
                <li>Click <strong>Scan & Load</strong>.</li>
            </ol>
            <p>This extracts titles, cleans them, and loads both <strong>Clean</strong> (for F2) and <strong>Raw</strong> (for F4) versions.</p>
          `;
        panel.appendChild(desc);

        const scanBtn = document.createElement('button');
        scanBtn.textContent = 'Scan & Load Items';
        scanBtn.style.width = '100%';
        scanBtn.style.padding = '8px';
        scanBtn.style.background = '#007bff';
        scanBtn.style.color = 'white';
        scanBtn.style.border = 'none';
        scanBtn.style.borderRadius = '4px';
        scanBtn.style.cursor = 'pointer';
        scanBtn.onclick = () => {
          // 1. Selector strategy
          const nodes = document.querySelectorAll('div[data-cy^="media-tile-image-title-"] h6');
          let rawNames = Array.from(nodes).map(el => el.textContent.trim()).filter(Boolean);

          if (rawNames.length === 0) {
            const imgs = document.querySelectorAll('img');
            rawNames = Array.from(imgs).map(img => img.title || img.alt).filter(t => t && t.trim());
          }

          if (rawNames.length === 0) {
            alert("No image titles found. Make sure you've scrolled to load content.");
            return;
          }

          // 2. Clean & Dedupe
          const seen = new Set();
          const cleanList = [];
          const rawList = [];

          for (const raw of rawNames) {
            const clean = Cleaner.clean(raw);
            if (!clean) continue;

            // Dedupe Key: case-folded, space-collapsed CLEAN name
            const key = clean.toLowerCase().replace(/\s+/g, ' ');
            if (seen.has(key)) continue;

            seen.add(key);
            cleanList.push(clean);
            rawList.push(raw);
          }

          if (cleanList.length === 0) {
            alert("Found items but they were filtered out by cleaning rules.");
            return;
          }

          // 3. Save to Paste Lists
          State.saveTokens(cleanList);
          State.saveRawTokens(rawList); // Save parallel list
          State.saveIndex(0);

          // 4. Feedback
          const proceed = confirm(`Scanned & Cleaned ${cleanList.length} items.\n\nSwitch to Sequential Paste mode now?`);
          if (proceed) {
            State.saveMode(MODES.PASTE);
            refreshUI();
          }
        };
        panel.appendChild(scanBtn);
      }
    }

    // --- Hotkey Listener ---
    document.addEventListener('keydown', async (e) => {
      // Only works if mode is PASTE
      if (State.getMode() !== MODES.PASTE) return;

      // F2: Paste CLEAN
      if (e.key === 'F2') {
        const tokens = State.getTokens();
        if (!tokens.length) return;
        e.preventDefault(); e.stopPropagation();

        const idx = State.getIndex();
        await smartPaste(tokens[idx]);

        // Advance unless Shift held
        if (!e.shiftKey) {
          State.saveIndex((idx + 1) % tokens.length);
        }
        if (panel.style.display === 'block') refreshUI();
        return;
      }

      // F4: Paste RAW
      if (e.key === 'F4') {
        // Try to get raw tokens, fallback to clean tokens
        const rawTokens = State.getRawTokens();
        const cleanTokens = State.getTokens();

        // Fallback: If no raw tokens (manually edited list?), use clean
        const tokens = (rawTokens.length === cleanTokens.length) ? rawTokens : cleanTokens;

        if (!tokens.length) return;
        e.preventDefault(); e.stopPropagation();

        const idx = State.getIndex();
        await smartPaste(tokens[idx]);

        // Advance unless Shift held
        if (!e.shiftKey) {
          State.saveIndex((idx + 1) % tokens.length);
        }
        if (panel.style.display === 'block') refreshUI();
        return;
      }
    });

  }
  initToolkit();

  // Later we can add more features like:
  // function initSomethingElse() { ... }
  // initSomethingElse();

})();
