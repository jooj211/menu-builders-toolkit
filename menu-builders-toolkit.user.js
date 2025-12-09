// ==UserScript==
// @name         Menu Builders' Toolkit
// @namespace    https://github.com/<your-username>/menu-builders-toolkit
// @version      0.1.0
// @description  Helper tools for Popmenu menu builders (modifier tags, etc.)
// @author       Jonatas Dias
// @match        https://my.popmenu.com/*
// @run-at       document-idle
// @grant        none
//
// NOTE: After first push, come back and set @updateURL and @downloadURL:
// @updateURL    https://raw.githubusercontent.com/<your-username>/menu-builders-toolkit/main/menu-builders-toolkit.user.js
// @downloadURL  https://raw.githubusercontent.com/<your-username>/menu-builders-toolkit/main/menu-builders-toolkit.user.js
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


  // ---- Feature 2, 3 & 4: Toolkit UI (Paste Tools + Image Scanner) ----
  function initToolkit() {
    console.log('[MBT] Initializing Toolkit UI');
    const MBT = (window.MBT = window.MBT || {});
    if (MBT._initializedToolkit) return;
    MBT._initializedToolkit = true;

    // --- State Keys ---
    const KEYS = {
      SEQ_TOKENS: 'mbt_seq_tokens',
      SEQ_INDEX: 'mbt_seq_index',
      ITEM_TEXT: 'mbt_item_text',
      ITEM_INDEX: 'mbt_item_index'
    };

    // --- Tag Code Mapping (Defaults) ---
    const TAG_MAP = {
      "Gluten-Free": "n-f",
      "Vegan": "gan",
      "Vegetarian": "ian"
    };

    // --- State Helpers ---
    const State = {
      getSeqTokens: () => {
        try { return JSON.parse(localStorage.getItem(KEYS.SEQ_TOKENS) || '[]'); }
        catch (e) { return []; }
      },
      saveSeqTokens: (t) => {
        localStorage.setItem(KEYS.SEQ_TOKENS, JSON.stringify(t));
      },
      getSeqIndex: () => parseInt(localStorage.getItem(KEYS.SEQ_INDEX) || '0', 10),
      saveSeqIndex: (i) => localStorage.setItem(KEYS.SEQ_INDEX, i),

      getItemText: () => localStorage.getItem(KEYS.ITEM_TEXT) || '',
      saveItemText: (t) => localStorage.setItem(KEYS.ITEM_TEXT, t),
      getItemIndex: () => parseInt(localStorage.getItem(KEYS.ITEM_INDEX) || '-1', 10),
      saveItemIndex: (i) => localStorage.setItem(KEYS.ITEM_INDEX, i)
    };

    // --- Parser ---
    function parseItemTagList(text) {
      const lines = text.split('\n');
      const items = [];
      let section = '';
      let pendingTitle = null;

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('**') && line.endsWith('**')) {
          section = line.slice(2, -2);
          pendingTitle = null;
          continue;
        }

        if (line.toLowerCase().startsWith('tags:')) {
          if (pendingTitle) {
            const tagPart = line.substring(5);
            const rawTags = tagPart.split(',').map(t => t.trim()).filter(Boolean);
            const normedTags = rawTags.map(t => {
              const k = t.toLowerCase().replace(/[-\s]/g, '');
              if (k.includes("glutenfree")) return "Gluten-Free";
              if (k.includes("vegan")) return "Vegan";
              if (k.includes("vegetarian")) return "Vegetarian";
              return t;
            });
            items.push({ title: pendingTitle, tags: normedTags, section });
            pendingTitle = null;
          }
          continue;
        }
        pendingTitle = line;
      }
      return items;
    }

    // --- Helpers ---
    async function smartPaste(text) {
      if (!text) return;
      const active = document.activeElement;
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
          try {
            await navigator.clipboard.writeText(text);
            console.log('[MBT] Copied to clipboard:', text);
          } catch (e) { console.error('[MBT] Clipboard failed', e); }
        }
      }
    }

    async function simulateTyping(text) {
      await smartPaste(text);
      const active = document.activeElement;
      if (active) {
        const opts = { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', which: 13 };
        active.dispatchEvent(new KeyboardEvent('keydown', opts));
        active.dispatchEvent(new KeyboardEvent('keypress', opts));
        active.dispatchEvent(new KeyboardEvent('keyup', opts));
        active.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // --- UI Construction ---
    const fab = document.createElement('button');
    fab.textContent = 'MBT';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '10000',
      padding: '10px 15px', background: '#2196F3', color: 'white',
      border: 'none', borderRadius: '50px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
      cursor: 'pointer', fontWeight: 'bold', fontFamily: 'sans-serif'
    });
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', bottom: '70px', right: '20px', zIndex: '10000',
      background: 'white', border: '1px solid #ccc', borderRadius: '8px',
      boxShadow: '0 8px 16px rgba(0,0,0,0.2)', padding: '15px', width: '340px',
      display: 'none', fontFamily: 'sans-serif', maxHeight: '80vh', overflowY: 'auto'
    });
    document.body.appendChild(panel);

    fab.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      if (panel.style.display === 'block') refreshUI();
    });

    function createSection(title, descText, storageKey, saveCallback) {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '20px';
      wrap.style.borderBottom = '1px solid #eee';
      wrap.style.paddingBottom = '10px';

      const head = document.createElement('strong');
      head.textContent = title;
      head.style.display = 'block';
      wrap.appendChild(head);

      const desc = document.createElement('small');
      desc.textContent = descText;
      desc.style.display = 'block';
      desc.style.color = '#666';
      desc.style.marginBottom = '5px';
      wrap.appendChild(desc);

      const area = document.createElement('textarea');
      area.style.width = '100%';
      area.style.height = '80px';
      area.style.marginBottom = '5px';
      area.value = (storageKey === KEYS.SEQ_TOKENS
        ? State.getSeqTokens().join('\n')
        : State.getItemText());

      wrap.appendChild(area);

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';

      const btn = document.createElement('button');
      btn.textContent = 'Save';
      btn.onclick = () => {
        saveCallback(area.value);
        refreshUI();
      };
      row.appendChild(btn);

      const status = document.createElement('span');
      status.style.fontSize = '11px';

      if (storageKey === KEYS.SEQ_TOKENS) {
        const toks = State.getSeqTokens();
        const idx = State.getSeqIndex();
        status.textContent = toks.length ? `Next: [${idx + 1}/${toks.length}]` : 'Empty';
      } else {
        const txt = State.getItemText();
        const items = parseItemTagList(txt);
        const idx = State.getItemIndex();
        status.textContent = items.length ? `Next: [${idx + 1}/${items.length}]` : 'Empty';
      }

      row.appendChild(status);
      wrap.appendChild(row);
      return wrap;
    }

    function refreshUI() {
      panel.innerHTML = '';
      const h3 = document.createElement('h3');
      h3.textContent = 'MBT Settings';
      h3.style.margin = '0 0 10px 0';
      panel.appendChild(h3);

      // Section 1: Sequential Paste
      const s1 = createSection('Sequential Paste', 'F2 sends next line.', KEYS.SEQ_TOKENS,
        (val) => {
          const lines = val.split('\n').filter(x => x.trim());
          State.saveSeqTokens(lines);
          State.saveSeqIndex(0);
        }
      );
      panel.appendChild(s1);

      // Section 2: Item & Tag Paster
      const s2 = createSection('Item & Tag Paster', 'F4=Title, Shift+F2=Tags.', KEYS.ITEM_TEXT,
        (val) => {
          State.saveItemText(val);
          State.saveItemIndex(-1);
        }
      );
      panel.appendChild(s2);

      // Section 3: Image Scanner
      const s3 = document.createElement('div');
      s3.innerHTML = `<strong>Image Title Scanner</strong><br/><small>Extracts img titles/alts from page.</small>`;
      s3.style.marginBottom = '20px';

      const scanBtn = document.createElement('button');
      scanBtn.textContent = 'Scan Images Now';
      scanBtn.style.marginTop = '5px';
      scanBtn.style.display = 'block';

      const resArea = document.createElement('textarea');
      resArea.style.width = '100%';
      resArea.style.height = '60px';
      resArea.style.marginTop = '5px';
      resArea.placeholder = 'Results will appear here...';

      scanBtn.onclick = () => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const titles = imgs.map(img => {
          return img.title || img.alt || img.getAttribute('data-original-title') || '';
        }).filter(t => t.trim().length > 0);

        if (titles.length === 0) {
          resArea.value = 'No unique titles found.';
        } else {
          // unique only
          const unique = [...new Set(titles)];
          resArea.value = unique.join('\n');
        }
      };

      s3.appendChild(scanBtn);
      s3.appendChild(resArea);
      panel.appendChild(s3);

      const help = document.createElement('div');
      help.style.fontSize = '11px';
      help.style.color = '#888';
      help.innerHTML = `
        <strong>Hotkeys:</strong><br/>
        F2: Paste next sequential token.<br/>
        F4: Paste next Item Title.<br/>
        Shift+F2: Type tags for current Item.
      `;
      panel.appendChild(help);
    }

    // --- Hotkey Listeners ---
    document.addEventListener('keydown', async (e) => {
      // Feature: Sequential Paste (F2 only, no shift)
      if (e.key === 'F2' && !e.shiftKey) {
        const tokens = State.getSeqTokens();
        if (!tokens.length) return;
        e.preventDefault(); e.stopPropagation();

        const idx = State.getSeqIndex();
        await smartPaste(tokens[idx]);

        State.saveSeqIndex((idx + 1) % tokens.length);
        if (panel.style.display === 'block') refreshUI();
        return;
      }

      // Feature: Item Paster (F4) -> Title
      if (e.key === 'F4') {
        const text = State.getItemText();
        const items = parseItemTagList(text);
        if (!items.length) return;
        e.preventDefault(); e.stopPropagation();

        let idx = State.getItemIndex();
        idx++;
        if (idx >= items.length) {
          alert('End of Item list reached.');
          return;
        }
        State.saveItemIndex(idx);

        const item = items[idx];
        console.log(`[MBT] Pasting title [${idx + 1}/${items.length}]: ${item.title}`);
        await smartPaste(item.title);

        if (panel.style.display === 'block') refreshUI();
        return;
      }

      // Feature: Item Tags (Shift + F2) -> Codes
      if (e.key === 'F2' && e.shiftKey) {
        const text = State.getItemText();
        const items = parseItemTagList(text);
        if (!items.length) return;
        e.preventDefault(); e.stopPropagation();

        const idx = State.getItemIndex();
        if (idx < 0 || idx >= items.length) {
          console.warn('[MBT] No current item selected (Press F4 first).');
          return;
        }

        const item = items[idx];
        console.log(`[MBT] Typing tags for "${item.title}":`, item.tags);

        for (const t of item.tags) {
          const code = TAG_MAP[t];
          if (code) {
            await simulateTyping(code);
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    });
  }
  initToolkit();

  // Later we can add more features like:
  // function initSomethingElse() { ... }
  // initSomethingElse();

})();
