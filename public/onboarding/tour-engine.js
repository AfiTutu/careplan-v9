/* Parametric tour engine
   UI, positioning, lifecycle and accessibility are isolated here. */
(() => {
  "use strict";

  const config = window.CarePlanTourConfig;
  const adapter = window.CarePlanTourAdapter;
  if (!config || !adapter) return;

  const ROOT_ID = "cp-parametric-tour";
  let root;
  let launcher;
  let layer;
  let spotlight;
  let arrow;
  let card;
  let content;
  let stepLabel;
  let currentIndex = 0;
  let isOpen = false;
  let activeTarget = null;
  let renderToken = 0;
  let repositionTimer = 0;

  function createRoot() {
    if (document.getElementById(ROOT_ID)) return;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button class="cp-tour-launcher" type="button"
        aria-label="${config.launcher.label}"
        title="${config.launcher.title}">${config.launcher.symbol}</button>

      <div class="cp-tour-layer" hidden>
        <div class="cp-tour-backdrop"></div>
        <div class="cp-tour-spotlight" hidden></div>
        <div class="cp-tour-arrow" hidden></div>

        <section class="cp-tour-card cp-tour-card--center"
          role="dialog" aria-modal="true"
          aria-labelledby="cp-tour-title" tabindex="-1">
          <header class="cp-tour-header">
            <span class="cp-tour-step-label"></span>
            <button class="cp-tour-close" type="button">Close</button>
          </header>
          <div class="cp-tour-content"></div>
        </section>
      </div>`;

    document.body.appendChild(root);

    launcher = root.querySelector(".cp-tour-launcher");
    layer = root.querySelector(".cp-tour-layer");
    spotlight = root.querySelector(".cp-tour-spotlight");
    arrow = root.querySelector(".cp-tour-arrow");
    card = root.querySelector(".cp-tour-card");
    content = root.querySelector(".cp-tour-content");
    stepLabel = root.querySelector(".cp-tour-step-label");

    launcher.addEventListener("click", showWelcome);
    root.querySelector(".cp-tour-close").addEventListener("click", close);
    root.querySelector(".cp-tour-backdrop").addEventListener("click", close);

    addEventListener("resize", scheduleReposition, { passive: true });
    addEventListener("scroll", scheduleReposition, true);
    document.addEventListener("keydown", handleKeydown);
  }

  function handleKeydown(event) {
    if (!isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previous();
    }
  }

  function setLayer(open) {
    isOpen = open;
    layer.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (!open) {
      activeTarget = null;
      spotlight.hidden = true;
      arrow.hidden = true;
    }
  }

  function showWelcome() {
    setLayer(true);
    activeTarget = null;
    spotlight.hidden = true;
    arrow.hidden = true;
    card.className = "cp-tour-card cp-tour-card--center";
    stepLabel.textContent = config.welcome.eyebrow;
    content.innerHTML = `
      <div class="cp-tour-welcome">
        <div class="cp-tour-mark">♡</div>
        <h2 id="cp-tour-title">${config.welcome.title}<span>${config.welcome.subtitle}</span></h2>
        <p>${config.welcome.copy}</p>
        <button class="cp-tour-start" type="button">${config.welcome.action}</button>
      </div>`;
    const start = content.querySelector(".cp-tour-start");
    start.addEventListener("click", () => showStep(0));
    requestAnimationFrame(() => start.focus({ preventScroll: true }));
  }

  function progress(index) {
    return config.steps.map((_, dotIndex) =>
      `<span class="cp-tour-dot${dotIndex === index ? " is-active" : ""}"></span>`
    ).join("");
  }

  async function showStep(index) {
    currentIndex = Math.max(0, Math.min(config.steps.length - 1, index));
    const step = config.steps[currentIndex];
    const token = ++renderToken;

    setLayer(true);
    spotlight.hidden = true;
    arrow.hidden = true;
    activeTarget = null;
    card.className = "cp-tour-card cp-tour-card--center cp-tour-card--loading";
    stepLabel.textContent = `Step ${currentIndex + 1} of ${config.steps.length}`;

    content.innerHTML = `
      <h2 id="cp-tour-title">${step.title}</h2>
      <p>${step.copy}</p>
      <div class="cp-tour-loading">Opening the correct place…</div>`;

    let target = null;
    try {
      target = await adapter.prepareStep(step);
    } catch (error) {
      console.warn("CarePlan tour step preparation failed safely:", step.id, error);
    }
    if (token !== renderToken) return;

    activeTarget = target;
    card.classList.remove("cp-tour-card--loading");

    content.innerHTML = `
      <h2 id="cp-tour-title">${step.title}</h2>
      <p>${step.copy}</p>
      <div class="cp-tour-actions">
        <button class="cp-tour-button cp-tour-previous" type="button"
          ${currentIndex === 0 ? "disabled" : ""}>← Previous</button>
        <div class="cp-tour-progress" aria-hidden="true">${progress(currentIndex)}</div>
        <button class="cp-tour-button cp-tour-next" type="button">
          ${currentIndex === config.steps.length - 1 ? "Finish" : "Next →"}
        </button>
      </div>`;

    content.querySelector(".cp-tour-previous").addEventListener("click", previous);
    content.querySelector(".cp-tour-next").addEventListener("click", next);

    position(step, target);
    requestAnimationFrame(() =>
      content.querySelector(".cp-tour-next")?.focus({ preventScroll: true })
    );
  }

  function next() {
    if (!isOpen) return;
    if (currentIndex >= config.steps.length - 1) close();
    else showStep(currentIndex + 1);
  }

  function previous() {
    if (!isOpen || currentIndex <= 0) return;
    showStep(currentIndex - 1);
  }

  function close() {
    ++renderToken;
    setLayer(false);
    launcher.focus({ preventScroll: true });
  }

  function getTargetRect(target) {
    if (!target || !adapter.visible(target)) return null;
    const rect = target.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return rect;
  }

  function spotlightTarget(rect) {
    const pad = Math.max(7, Math.min(12, Math.min(rect.width, rect.height) * 0.12));
    spotlight.hidden = false;
    spotlight.style.left = `${Math.max(5, rect.left - pad)}px`;
    spotlight.style.top = `${Math.max(5, rect.top - pad)}px`;
    spotlight.style.width = `${Math.min(innerWidth - 10, rect.width + pad * 2)}px`;
    spotlight.style.height = `${Math.min(innerHeight - 10, rect.height + pad * 2)}px`;
  }

  function choosePlacement(rect, cardWidth, cardHeight, requested = "auto") {
    const gap = 22;
    const spaces = {
      top: rect.top,
      bottom: innerHeight - rect.bottom,
      left: rect.left,
      right: innerWidth - rect.right
    };

    if (requested !== "auto" && spaces[requested] > (
      requested === "top" || requested === "bottom" ? cardHeight + gap : cardWidth + gap
    )) return requested;

    return Object.entries(spaces)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .find(name => {
        const required = name === "top" || name === "bottom"
          ? cardHeight + gap
          : cardWidth + gap;
        return spaces[name] >= required;
      }) || "bottom";
  }

  function placeCard(rect, placement) {
    const margin = 14;
    const gap = 22;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let left;
    let top;

    if (placement === "top") {
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.top - height - gap;
    } else if (placement === "bottom") {
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.bottom + gap;
    } else if (placement === "left") {
      left = rect.left - width - gap;
      top = rect.top + rect.height / 2 - height / 2;
    } else {
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - height / 2;
    }

    left = Math.max(margin, Math.min(innerWidth - width - margin, left));
    top = Math.max(margin, Math.min(innerHeight - height - margin, top));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    return { left, top, width, height };
  }

  function placeArrow(rect, cardRect, placement) {
    arrow.hidden = false;
    arrow.className = `cp-tour-arrow cp-tour-arrow--${placement}`;

    if (placement === "top" || placement === "bottom") {
      const x = Math.max(
        cardRect.left + 24,
        Math.min(cardRect.left + cardRect.width - 24, rect.left + rect.width / 2)
      );
      arrow.style.left = `${x}px`;
      arrow.style.top = placement === "top"
        ? `${cardRect.top + cardRect.height - 1}px`
        : `${cardRect.top - 11}px`;
    } else {
      const y = Math.max(
        cardRect.top + 24,
        Math.min(cardRect.top + cardRect.height - 24, rect.top + rect.height / 2)
      );
      arrow.style.top = `${y}px`;
      arrow.style.left = placement === "left"
        ? `${cardRect.left + cardRect.width - 1}px`
        : `${cardRect.left - 11}px`;
    }
  }

  function position(step, target) {
    const rect = getTargetRect(target);

    if (step.floating || !rect) {
      card.className = "cp-tour-card cp-tour-card--center";
      spotlight.hidden = true;
      arrow.hidden = true;
      return;
    }

    card.className = "cp-tour-card";
    spotlightTarget(rect);

    const placement = choosePlacement(
      rect,
      card.offsetWidth,
      card.offsetHeight,
      step.placement || "auto"
    );
    const cardRect = placeCard(rect, placement);
    placeArrow(rect, cardRect, placement);
  }

  function scheduleReposition() {
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => {
      if (!isOpen || !config.steps[currentIndex]) return;
      position(config.steps[currentIndex], activeTarget);
    }, 50);
  }

  window.CarePlanOnboarding = Object.freeze({
    open: showWelcome,
    start: () => showStep(0),
    close,
    restart: showWelcome,
    goTo: index => showStep(Number(index) || 0),
    config
  });

  createRoot();
})();
