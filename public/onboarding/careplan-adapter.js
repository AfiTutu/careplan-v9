/* CarePlan application adapter
   This is the only file that knows how CarePlan navigation works. */
(() => {
  "use strict";

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0;
  }

  function queryVisible(selector, root = document) {
    try {
      const items = [...root.querySelectorAll(selector)];
      return items.find(visible) || items[0] || null;
    } catch {
      return null;
    }
  }

  function clickElement(element) {
    if (!element) return false;
    element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    return true;
  }

  async function waitFor(check, timeout = 2200, interval = 45) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = check();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function screenIsActive(screen) {
    return document.querySelector(`#screen-${CSS.escape(screen)}.active`);
  }

  function screenButton(screen) {
    return queryVisible(`[data-v94-mobile="${CSS.escape(screen)}"]`) ||
      queryVisible(`[data-v94-nav="${CSS.escape(screen)}"]`) ||
      document.querySelector(`[data-v94-nav="${CSS.escape(screen)}"]`);
  }

  async function openScreen(screen) {
    if (!screen) return true;
    if (screenIsActive(screen)) return true;

    const button = await waitFor(() => screenButton(screen));
    if (!button) return false;

    clickElement(button);
    return !!(await waitFor(() => screenIsActive(screen)));
  }

  async function openProfileTab(tab) {
    if (!tab) return true;
    const selector = `[data-profile-tab="${CSS.escape(tab)}"]`;
    const button = await waitFor(() => queryVisible(selector));
    if (!button) return false;

    if (!button.classList.contains("active")) clickElement(button);
    return !!(await waitFor(() => {
      const current = queryVisible(selector);
      return current && current.classList.contains("active") ? current : null;
    }));
  }

  async function navigate(route = {}) {
    if (route.screen) await openScreen(route.screen);
    if (route.profileTab) await openProfileTab(route.profileTab);
    await sleep(80);
    return true;
  }

  function targetFromText(spec) {
    if (!spec?.text?.length) return null;
    const root = spec.within ? document.querySelector(spec.within) : document;
    if (!root) return null;

    const wanted = spec.text.map(value => String(value).trim().toLowerCase());
    const candidates = [...root.querySelectorAll(
      "button,a,h1,h2,h3,h4,strong,label,.section-title,.v94-section-head,.v94-page-head,.card"
    )];

    for (const candidate of candidates) {
      if (!visible(candidate)) continue;
      const text = (candidate.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (wanted.some(fragment => text.includes(fragment))) {
        return candidate.closest("button,a,.section-title,.v94-section-head,.card") || candidate;
      }
    }
    return null;
  }

  function resolveTarget(spec = {}) {
    for (const selector of spec.selectors || []) {
      const element = queryVisible(selector);
      if (element && visible(element)) return element;
    }
    return targetFromText(spec);
  }

  async function prepareStep(step) {
    await navigate(step.route || {});
    if (step.floating) return null;

    const target = await waitFor(() => resolveTarget(step.target), 2500);
    if (!target) return null;

    target.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
    await sleep(260);
    return resolveTarget(step.target) || target;
  }

  window.CarePlanTourAdapter = Object.freeze({
    visible,
    waitFor,
    navigate,
    resolveTarget,
    prepareStep
  });
})();
