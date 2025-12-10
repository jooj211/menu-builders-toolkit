// ==UserScript==
// @name         Menu Builders' Toolkit
// @namespace    https://github.com/jooj211/menu-builders-toolkit
// @version      0.1.1
// @description  Helper tools for Popmenu menu builders (modifier tags, etc.)
// @author       Jonatas Dias
// @match        https://my.popmenu.com/*
// @run-at       document-idle
// @grant        none
//
// @updateURL    https://raw.githubusercontent.com/jooj211/menu-builders-toolkit/main/menu-builders-toolkit.user.js
// @downloadURL  https://raw.githubusercontent.com/jooj211/menu-builders-toolkit/main/menu-builders-toolkit.user.js
// ==/UserScript==

(function () {
  'use strict';

  console.log('[MBT] Menu Builders\' Toolkit loaded');

  // Only run on menus pages (adjust if needed)
  //  if (!location.pathname.includes('/menus')) {
  //    console.log('[MBT] Not on menus page, exiting');
  //    return;
  //  }

  // ---- Feature 1: Modifier tags on menu items ----

  function bootstrapModifierTagsFeature() {
    console.log('[MBT] Initializing modifier tag feature');

    const MBT = (window.MBT = window.MBT || {});
    if (MBT._initializedModifierTags) {
      console.log('[MBT] Modifier tags feature already initialized, skipping.');
      return;
    }
    MBT._initializedModifierTags = true;

    console.log("[MBT] Feature #1: modifier tags.");

    // Wait until menu cards exist, then actually start the feature
    function waitForMenuCardsAndInit(retries = 30) {
      const cards = document.querySelectorAll('[data-cy="menu_item_card"]');
      if (cards.length > 0) {
        console.log('[MBT] Found menu cards, starting modifier tags feature.');
        actuallyInitModifierTagsFeature();
        return;
      }

      if (retries <= 0) {
        console.warn('[MBT] No menu cards detected; modifier tags not started.');
        return;
      }

      setTimeout(() => waitForMenuCardsAndInit(retries - 1), 500);
    }

    // ------------- Feature #1 core -------------

    function actuallyInitModifierTagsFeature() {
      const GRAPHQL_ENDPOINT = '/graphql';
      const csrf =
        document.querySelector('meta[name="csrf-token"]')?.content || null;

      // This is the operationId you saw in DevTools for menusDish
      const MENUS_DISH_OPERATION_ID =
        'PopmenuClient/0f13f56760eab1aef13c415f7c22d35e';

      // Cache dish data per menuItemId
      const dishCache = new Map();

      // Backup query (used when persisted query fails)
      const CUSTOM_QUERY = `
        query menusDishModTags($menuItemId: Int!) {
          dish(menuItemId: $menuItemId) {
            id
            name
            modifierGroups {
              id
              name
              isEnabled
              minSelectionsCount
              maxSelectionsCount
            }
            selectedMenuItem {
              id
              modifierGroups {
                id
                name
                isEnabled
                minSelectionsCount
                maxSelectionsCount
              }
            }
          }
        }
      `;

      const formatRangeTooltip = (group) => {
        const min = group.minSelectionsCount;
        const max = group.maxSelectionsCount;

        const parts = [];
        if (typeof min === 'number') parts.push(`Min: ${min}`);
        if (typeof max === 'number') parts.push(`Max: ${max}`);
        return parts.join(' • ');
      };

      function getModifierGroupsFromDish(dish, menuItemId) {
        if (!dish) {
          console.warn(
            '[MBT][MOD-TAGS] getModifierGroupsFromDish: dish is null for',
            menuItemId
          );
          return [];
        }

        const fromDish = Array.isArray(dish.modifierGroups)
          ? dish.modifierGroups
          : [];

        const fromSelected = Array.isArray(
          dish.selectedMenuItem?.modifierGroups
        )
          ? dish.selectedMenuItem.modifierGroups
          : [];

        console.log(
          '[MBT][MOD-TAGS] Raw groups for',
          menuItemId,
          {
            dishId: dish.id,
            fromDishCount: fromDish.length,
            fromSelectedCount: fromSelected.length,
            selectedMenuItem: dish.selectedMenuItem
              ? {
                id: dish.selectedMenuItem.id,
                hasModifierGroups: Array.isArray(
                  dish.selectedMenuItem.modifierGroups
                )
                  ? dish.selectedMenuItem.modifierGroups.length
                  : 0,
              }
              : null,
          }
        );

        const merged = [...fromDish, ...fromSelected];
        const seen = new Set();

        const deduped = merged.filter((group) => {
          if (!group || group.id == null) return false;
          if (seen.has(group.id)) return false;
          seen.add(group.id);
          return true;
        });

        if (!deduped.length) {
          console.warn(
            '[MBT][MOD-TAGS] No modifier groups found after merge for',
            menuItemId
          );
        }

        return deduped;
      }

      async function fetchMenusDishPersisted(menuItemId) {
        const body = {
          operationName: 'menusDish',
          variables: { menuItemId },
          extensions: {
            operationId: MENUS_DISH_OPERATION_ID,
          },
        };

        console.log(
          '[MBT][MOD-TAGS] [persisted] Fetching menusDish for',
          menuItemId,
          body
        );

        const resp = await fetch(GRAPHQL_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify(body),
        });

        console.log(
          '[MBT][MOD-TAGS] [persisted] Response status for',
          menuItemId,
          resp.status
        );

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const json = await resp.json();
        console.log(
          '[MBT][MOD-TAGS] [persisted] GraphQL JSON for',
          menuItemId,
          json
        );
        return json?.data?.dish || null;
      }

      async function fetchMenusDishCustom(menuItemId) {
        const body = {
          operationName: 'menusDishModTags',
          query: CUSTOM_QUERY,
          variables: { menuItemId },
        };

        console.log(
          '[MBT][MOD-TAGS] [custom] Fetching menusDishModTags for',
          menuItemId,
          body
        );

        const resp = await fetch(GRAPHQL_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify(body),
        });

        console.log(
          '[MBT][MOD-TAGS] [custom] Response status for',
          menuItemId,
          resp.status
        );

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const json = await resp.json();
        console.log(
          '[MBT][MOD-TAGS] [custom] GraphQL JSON for',
          menuItemId,
          json
        );
        return json?.data?.dish || null;
      }

      async function fetchDishData(menuItemId) {
        if (dishCache.has(menuItemId)) {
          console.log(
            '[MBT][MOD-TAGS] Using cached dish for',
            menuItemId
          );
          return dishCache.get(menuItemId);
        }

        let dish = null;
        let source = null;

        // Try persisted query first so we match the app exactly
        try {
          dish = await fetchMenusDishPersisted(menuItemId);
          source = 'persisted';
        } catch (e) {
          console.warn(
            '[MBT][MOD-TAGS] Persisted menusDish failed for',
            menuItemId,
            e
          );
        }

        // Fallback to custom query if needed
        if (!dish) {
          try {
            dish = await fetchMenusDishCustom(menuItemId);
            source = source ? source + '+custom' : 'custom';
          } catch (e2) {
            console.error(
              '[MBT][MOD-TAGS] Custom menusDishModTags also failed for',
              menuItemId,
              e2
            );
          }
        }

        console.log(
          '[MBT][MOD-TAGS] Final dish for',
          menuItemId,
          'from source:',
          source,
          dish
        );

        dishCache.set(menuItemId, dish);
        return dish;
      }

      async function tagCard(card) {
        try {
          const idAttr = card.id || card.getAttribute('id');
          const match = idAttr && idAttr.match(/^(\d+)-menu-item$/);

          if (!match) {
            console.warn(
              '[MBT][MOD-TAGS] Could not extract menuItemId from',
              idAttr
            );
            return;
          }

          const menuItemId = parseInt(match[1], 10);
          console.log(
            '[MBT][MOD-TAGS] Tagging card for menuItemId',
            menuItemId,
            card
          );

          // Create / clear tag container
          let tagContainer = card.querySelector('.mbt-mod-tag-container');
          if (!tagContainer) {
            const headerContent =
              card.querySelector('.MuiCardHeader-content-2135') || card;

            tagContainer = document.createElement('div');
            tagContainer.className = 'mbt-mod-tag-container';
            tagContainer.style.marginTop = '-0.5rem';
            tagContainer.style.paddingBottom = '1rem';
            tagContainer.style.paddingLeft = '1rem';
            tagContainer.style.display = 'flex';
            tagContainer.style.flexWrap = 'wrap';
            tagContainer.style.gap = '4px';
            tagContainer.style.fontSize = '11px';
            tagContainer.style.alignItems = 'center';

            headerContent.appendChild(tagContainer);
          } else {
            tagContainer.textContent = '';
          }

          tagContainer.textContent = 'Loading modifiers…';

          const dish = await fetchDishData(menuItemId);
          const modifierGroups = getModifierGroupsFromDish(
            dish,
            menuItemId
          );

          console.log(
            '[MBT][MOD-TAGS] modifierGroups for',
            menuItemId,
            'count:',
            modifierGroups.length,
            modifierGroups
          );

          tagContainer.textContent = '';

          if (!modifierGroups.length) {
            tagContainer.textContent = 'No modifiers';
            tagContainer.style.opacity = '0.6';
            return;
          }

          for (const group of modifierGroups) {
            if (!group || !group.name) continue;

            const span = document.createElement('span');
            span.textContent = group.name;
            span.style.border = '1px solid rgba(0,0,0,0.2)';
            span.style.borderRadius = '9999px';
            span.style.padding = '1px 6px';
            span.style.whiteSpace = 'nowrap';

            // Check isEnabled (default to true if missing to be safe)
            const isEnabled = group.isEnabled !== false;

            if (isEnabled) {
              span.style.background = '#f5f5f5';
              span.style.color = '#000';
            } else {
              // Disabled look
              span.style.background = '#e0e0e0';
              span.style.color = '#888';
              span.style.opacity = '0.6';
            }

            const tooltip = formatRangeTooltip(group);
            if (tooltip) {
              span.title = tooltip; // native hover tooltip
            }

            tagContainer.appendChild(span);
          }
        } catch (err) {
          console.error('[MBT][MOD-TAGS] Error tagging card', card, err);
          const existing = card.querySelector('.mbt-mod-tag-container');
          if (existing) {
            existing.textContent = 'Tags: error';
            existing.style.opacity = '0.7';
          }
        }
      }

      function scanAndTagAll() {
        const cards = Array.from(
          document.querySelectorAll('[data-cy="menu_item_card"]')
        );
        console.log(
          '[MBT][MOD-TAGS] scanAndTagAll found',
          cards.length,
          'cards'
        );
        cards.forEach((card) => tagCard(card));
      }

      // Initial run
      scanAndTagAll();

      // Re-tag cards as new ones are lazy-loaded
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;

            if (node.matches?.('[data-cy="menu_item_card"]')) {
              console.log(
                '[MBT][MOD-TAGS] New card node detected',
                node
              );
              tagCard(node);
            }

            const innerCards = node.querySelectorAll?.(
              '[data-cy="menu_item_card"]'
            );
            if (innerCards && innerCards.length) {
              console.log(
                '[MBT][MOD-TAGS] New subtree with',
                innerCards.length,
                'cards detected'
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

      MBT.modTagsObserver = observer;

      // ---- Debug helper: compare persisted vs custom for a given menuItemId ----
      MBT.debugMenusDish = async function (menuItemId) {
        console.log(
          '%c[MBT][DEBUG] Running debugMenusDish for ' + menuItemId,
          'color: purple; font-weight: bold;'
        );
        try {
          const dishPersisted = await fetchMenusDishPersisted(menuItemId);
          console.log(
            '[MBT][DEBUG] Persisted menusDish result for',
            menuItemId,
            dishPersisted
          );
        } catch (e) {
          console.error(
            '[MBT][DEBUG] Persisted menusDish failed for',
            menuItemId,
            e
          );
        }

        try {
          const dishCustom = await fetchMenusDishCustom(menuItemId);
          console.log(
            '[MBT][DEBUG] Custom menusDishModTags result for',
            menuItemId,
            dishCustom
          );
        } catch (e2) {
          console.error(
            '[MBT][DEBUG] Custom menusDishModTags failed for',
            menuItemId,
            e2
          );
        }
      };

      console.log(
        '[MBT][MOD-TAGS] Modifier tags feature initialized, observer attached.'
      );
    }

    // Kick off once content is there
    waitForMenuCardsAndInit();
  }

  // Start feature 1
  bootstrapModifierTagsFeature();


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
      INDEX: 'mbt_index',
      MODE: 'mbt_mode'
    };

    // --- State Management ---
    const State = {
      getTokens: () => {
        try {
          const raw = JSON.parse(localStorage.getItem(KEYS.TOKENS) || '[]');
          // Migration: If array of strings, convert to objects
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
            return raw.map(s => ({ name: s, url: '' }));
          }
          return raw;
        }
        catch { return []; }
      },
      saveTokens: (t) => localStorage.setItem(KEYS.TOKENS, JSON.stringify(t)),

      getIndex: () => parseInt(localStorage.getItem(KEYS.INDEX) || '0', 10),
      saveIndex: (i) => localStorage.setItem(KEYS.INDEX, i),

      getMode: () => localStorage.getItem(KEYS.MODE) || MODES.PASTE,
      saveMode: (m) => localStorage.setItem(KEYS.MODE, m)
    };

    // --- Logic: Cleaning ---
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
        // remove (1), and trailing View names like Top, Side
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

      // Select all before pasting (replacement behavior)
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
          const start = active.selectionStart;
          const end = active.selectionEnd;
          const val = active.value;
          active.value = val.slice(0, start) + text + val.slice(end);
          active.selectionStart = active.selectionEnd = start + text.length;
          active.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          try { await navigator.clipboard.writeText(text); } catch (e) { }
        }
      }
    }

    // --- UI Construction ---
    const fab = document.createElement('button');
    fab.textContent = 'MBT';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '9999999',
      padding: '10px 15px', background: '#333', color: 'white',
      border: 'none', borderRadius: '50px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      cursor: 'pointer', fontWeight: 'bold', fontFamily: 'sans-serif'
    });
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', bottom: '80px', right: '20px', zIndex: '9999999',
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
        <option value="${MODES.PASTE}">Sequential Paste (F2)</option>
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
        const desc = document.createElement('p');
        desc.style.fontSize = '12px';
        desc.style.color = '#666';
        desc.textContent = 'Pastes tokens line-by-line. F2 = Clean Name (Advances), F4 = Raw Name (Stays).';
        panel.appendChild(desc);

        const area = document.createElement('textarea');
        area.style.width = '100%';
        area.style.height = '120px';
        area.style.marginBottom = '8px';
        area.style.whiteSpace = 'pre';

        const tokens = State.getTokens();
        // Display format: Name ||| URL
        area.value = tokens.map(t => `${t.name} ||| ${t.url}`).join('\n');
        panel.appendChild(area);

        const bar = document.createElement('div');
        bar.style.display = 'flex';
        bar.style.justifyContent = 'space-between';
        bar.style.alignItems = 'center';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save List';
        saveBtn.onclick = () => {
          const lines = area.value.split('\n').filter(x => x.trim());
          const newTokens = lines.map(line => {
            const parts = line.split(' ||| ');
            if (parts.length < 2) return { name: line.trim(), url: '' };
            return { name: parts[0].trim(), url: parts.slice(1).join(' ||| ').trim() };
          });
          State.saveTokens(newTokens);
          State.saveIndex(0);
          refreshUI();
        };
        bar.appendChild(saveBtn);

        const status = document.createElement('span');
        status.style.fontSize = '11px';
        const idx = State.getIndex();
        const nextItem = tokens[idx] || {};
        status.textContent = tokens.length ? `Next: [${idx + 1}/${tokens.length}]` : 'Empty';
        status.title = `Next Name: ${nextItem.name || '?'}`;
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
            <p>This will extract titles, clean them (fix casing, remove extensions), and <strong>overwrite</strong> the Sequential Paste list.</p>
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
          // Reverted Strategy: Specific selector for image tiles
          // logic from parse.py / previous script version
          const nodes = document.querySelectorAll('div[data-cy^="media-tile-image-title-"] h6');
          let rawItems = Array.from(nodes).map(el => {
            const raw = el.textContent.trim();
            return { raw: raw, clean: '' }; // Clean later
          }).filter(x => x.raw);

          // Fallback only if specific selector fails completely (safe fallback, maybe avoiding generic img)
          if (rawItems.length === 0) {
            // Try searching generic images but filter out small ones or logos? 
            // Better to just alert if specific selector fails to avoid bad data.
            // But let's check if the user *wants* fallback. 
            // "it just gets one item with the name of the restaurant".
            // So the generic fallback was the problem. We will disable generic fallback or make it smarter.
            // Let's stick to the specific selector for now as calling it "Revert".
            alert("No image titles found with specific selector (h6 inside media-tile). Scroll down?");
            return;
          }

          // Dedupe & Clean
          const seen = new Set();
          const cleanedList = [];

          for (const item of rawItems) {
            const cleanName = Cleaner.clean(item.raw);
            if (!cleanName) continue;

            // Dedupe by Raw -> Ensure we capture unique files
            // OR Dedupe by Clean -> Ensure we capture unique Menu Item Names?
            // User said: "save the raw names ... and also saving the cleaned image name"
            // If we have "Burger.jpg" and "Burger(1).jpg", both clean to "Burger".
            // If we dedupe by Clean, we lose one.
            // If we dedupe by Raw, we keep both. F2 will paste "Burger" twice. 
            // This might be desired if they have 2 images for the item?
            // Let's dedupe by RAW to preserve all scanned images.
            const key = item.raw;
            if (seen.has(key)) continue;

            seen.add(key);
            cleanedList.push({ name: cleanName, url: item.raw }); // Mapping 'url' property to raw name for F4
          }

          if (cleanedList.length === 0) {
            alert("Found items but they were filtered out by cleaning rules.");
            return;
          }

          // 3. Save to Paste List
          State.saveTokens(cleanedList);
          State.saveIndex(0);

          // 4. Feedback
          const proceed = confirm(`Scanned & Cleaned ${cleanedList.length} items.\n\nSwitch to Sequential Paste mode now?`);
          if (proceed) {
            State.saveMode(MODES.PASTE);
            refreshUI();
          }
        };
        panel.appendChild(scanBtn);
      }
    }

    // --- Hotkey Listener ---
    let lastPastedIndex = null;

    document.addEventListener('keydown', async (e) => {
      // F2 Logic (Name + Advance) or F4 Logic (URL/Raw + Stay)
      if ((e.key === 'F2' || e.key === 'F4') && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (State.getMode() !== MODES.PASTE) return;

        const tokens = State.getTokens();
        if (!tokens.length) return;

        e.preventDefault(); e.stopPropagation();

        const idx = State.getIndex();

        if (e.key === 'F2') {
          // Paste Name & Advance
          const item = tokens[idx];
          console.log('[MBT] Pasting Name:', item.name);
          await smartPaste(item.name);

          lastPastedIndex = idx;
          State.saveIndex((idx + 1) % tokens.length);
        } else {
          // F4: Smart "Peek Back" Logic
          // If we just advanced (lastPastedIndex == idx - 1), user likely wants the Image for the Name they just pasted.
          // Otherwise (fresh load, skipped F2), user likely wants the Image for the "Current" pending item.
          let targetIdx = idx;
          // Handle wrap-around edge case check carefully or simplified:
          // Just checking strict idx-1 is safe for non-looping. 
          // If loop occurred (max -> 0), idx is 0, last is max.

          const prevIdx = (idx - 1 + tokens.length) % tokens.length;
          if (lastPastedIndex !== null && lastPastedIndex === prevIdx) {
            targetIdx = prevIdx;
          }

          const item = tokens[targetIdx];
          console.log(`[MBT] Pasting Raw (Index ${targetIdx}):`, item.url);
          await smartPaste(item.url);
        }

        // Refresh UI if open to show progress
        if (panel.style.display === 'block') refreshUI();
      }
    });

  }
  initToolkit();

})();
