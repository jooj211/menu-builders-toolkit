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
  if (!location.pathname.includes('/menus')) {
    console.log('[MBT] Not on menus page, exiting');
    return;
  }

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
              minSelectionsCount
              maxSelectionsCount
            }
            selectedMenuItem {
              id
              modifierGroups {
                id
                name
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
            span.style.background = '#f5f5f5';
            span.style.whiteSpace = 'nowrap';

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

})();
