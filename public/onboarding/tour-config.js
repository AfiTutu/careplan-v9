/* CarePlan onboarding configuration
   Add, remove, or reorder steps here without changing the engine. */
(() => {
  "use strict";

  window.CarePlanTourConfig = Object.freeze({
    version: "1.0.0",
    launcher: {
      label: "Open guided tour",
      title: "How to use CarePlan",
      symbol: "?"
    },
    welcome: {
      eyebrow: "Guided onboarding",
      title: "CarePlan",
      subtitle: "Specialcare",
      copy: "Let’s walk through the exact places you will use to organise care, meals and important records.",
      action: "Show me around"
    },
    finish: {
      title: "That’s it!",
      copy: "May Allah ease everything for you & your loved one ☺️ — AFI"
    },
    steps: [
      {
        id: "home",
        title: "Your CarePlan home",
        copy: "This is your daily overview. See today’s care, meals, medicines and appointments in one timeline.",
        route: { screen: "today" },
        target: {
          selectors: [
            '[data-v94-mobile="today"]',
            '[data-v94-nav="today"]',
            "#todayScroll .v96-progress-summary",
            "#todayScroll .v94-page-head"
          ],
          prefer: "visible"
        },
        placement: "top"
      },
      {
        id: "patient",
        title: "Create the patient profile",
        copy: "Open Profile, then use Patient to save identity, diagnosis, feeding and essential care information.",
        route: { screen: "profile", profileTab: "patient" },
        target: {
          selectors: ['[data-profile-tab="patient"]'],
          prefer: "visible"
        },
        placement: "bottom"
      },
      {
        id: "caregivers",
        title: "Add caregivers",
        copy: "Use Caregivers to record the people involved in care and their contact details.",
        route: { screen: "profile", profileTab: "caregivers" },
        target: {
          selectors: ['[data-profile-tab="caregivers"]'],
          prefer: "visible"
        },
        placement: "bottom"
      },
      {
        id: "hospitals",
        title: "Add hospitals and care centres",
        copy: "Use Hospitals to save centres, departments, consultants and record numbers.",
        route: { screen: "profile", profileTab: "hospitals" },
        target: {
          selectors: ['[data-profile-tab="hospitals"]'],
          prefer: "visible"
        },
        placement: "bottom"
      },
      {
        id: "data",
        title: "Protect your CarePlan data",
        copy: "Use Data & safety to install the PWA and download a password-encrypted backup regularly.",
        route: { screen: "profile", profileTab: "data" },
        target: {
          selectors: [
            '[data-profile-tab="data"]',
            '[data-v94-export]',
            "#profileScroll .profile-card"
          ],
          prefer: "visible"
        },
        placement: "bottom"
      },
      {
        id: "care-library",
        title: "Build your Care Library",
        copy: "Save reusable care routines here, then add them to the weekly care plan whenever needed.",
        route: { screen: "care" },
        target: {
          selectors: [
            '[data-v96-new-care-library]',
            '#careScroll [data-v95-new-library]',
            "#careScroll .v95-library-toolbar"
          ],
          text: ["Care Library", "Saved care library", "Reusable"],
          within: "#careScroll",
          prefer: "visible"
        },
        placement: "auto"
      },
      {
        id: "meal-library",
        title: "Build your Meal Library",
        copy: "Save reusable meals, feeds and recipes here, then add them to the weekly meal plan.",
        route: { screen: "meals" },
        target: {
          selectors: [
            '#mealsScroll [data-v94-new="mealLibrary"]',
            "#mealsScroll .v94-grid3"
          ],
          text: ["Saved meal library", "Reusable feeds"],
          within: "#mealsScroll",
          prefer: "visible"
        },
        placement: "auto"
      },
      {
        id: "calendar",
        title: "Use the unified calendar",
        copy: "The calendar combines care, meals, medicines and appointments. You can also print or export it.",
        route: { screen: "calendar" },
        target: {
          selectors: [
            "#calendarScroll .v94-calendar-card",
            "#calendarScroll .v94-cal-grid",
            "#calendarScroll .v94-page-head"
          ],
          prefer: "visible"
        },
        placement: "auto"
      },
      {
        id: "sos",
        title: "Prepare an SOS handover",
        copy: "SOS gathers the patient, caregiver, hospital, medicine and safety details needed during an urgent handover.",
        route: { screen: "sos" },
        target: {
          selectors: [
            "#sosScroll .v96-sos-hero",
            "#sosScroll .detail-hero",
            "#sosScroll .v94-page-head",
            "#screen-sos"
          ],
          prefer: "visible"
        },
        placement: "auto"
      },
      {
        id: "records",
        title: "Plan & keep records",
        copy: "Use Appointments, Grocery and Logs to plan ahead and keep important daily records.",
        floating: true
      },
      {
        id: "finish",
        title: "That’s it!",
        copy: "May Allah ease everything for you & your loved one ☺️ — AFI",
        floating: true,
        finish: true
      }
    ]
  });
})();
