/* Fail-safe bootstrap. The tour is mounted only after CarePlan finishes loading. */
(() => {
  "use strict";

  function boot() {
    try {
      if (!window.CarePlanTourConfig ||
          !window.CarePlanTourAdapter ||
          !window.CarePlanOnboarding) {
        console.warn("CarePlan onboarding modules were not fully available.");
      }
    } catch (error) {
      console.error("CarePlan onboarding was disabled safely:", error);
    }
  }

  if (document.readyState === "complete") {
    setTimeout(boot, 500);
  } else {
    window.addEventListener("load", () => setTimeout(boot, 500), { once: true });
  }
})();
