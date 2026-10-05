const MODULE_ID = "sidebar-button-labels";
const FADE_MS = 150;

const getSetting = key => game.settings.get(MODULE_ID, key);

/**
 * A group is one hover area: hovering any button inside `selector` shows labels
 * for every button inside it.
 *  - side: which side of the buttons the labels appear on
 *  - interactive: whether labels can be clicked / hovered. 
 *  - enabled: function returning whether this group is currently turned on in settings
 */
class LabelGroup {
  constructor({ id, selector, side, interactive, enabled }) {
    Object.assign(this, { id, selector, side, interactive });
    this.enabledFn = enabled;
    this.containerId = `stl-${id}`;
    this.container = null;
    this.entries = [];
    this.visible = false;
    this.showTimer = null;
    this.hideTimer = null;
    this.removeTimer = null;
    this.raf = null;
  }

  isEnabled() {
    return getSetting("enabled") && this.enabledFn();
  }

  // Is this element part of the hover area?
  contains(el) {
    return el instanceof Element
      && !!(el.closest(this.selector) || el.closest(`#${this.containerId}`));
  }

  getButtons() {
    return Array.from(document.querySelectorAll(`${this.selector} button`)).filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  getLabelText(btn) {
    const text = btn.getAttribute("aria-label")
      || btn.dataset.stlTooltip
      || btn.dataset.tooltipText
      || btn.dataset.tooltip
      || btn.title
      || "";
    return game.i18n.localize(text).trim();
  }

  stripNativeTooltips() {
    for (const el of document.querySelectorAll(`${this.selector} [data-tooltip]`)) {
      el.dataset.stlTooltip = el.getAttribute("data-tooltip");
      el.removeAttribute("data-tooltip");
    }
    game.tooltip?.deactivate();
  }

  restoreNativeTooltips() {
    for (const el of document.querySelectorAll(`${this.selector} [data-stl-tooltip]`)) {
      el.setAttribute("data-tooltip", el.dataset.stlTooltip);
      delete el.dataset.stlTooltip;
    }
  }

  build() {
    const interactive = this.interactive && getSetting("clickableLabels");
    this.container?.remove();
    this.container = document.createElement("div");
    this.container.id = this.containerId;
    this.container.className = "stl-container";
    this.container.dataset.side = this.side;
    this.container.classList.toggle("interactive", interactive);

    this.entries = [];
    for (const btn of this.getButtons()) {
      const text = this.getLabelText(btn);
      if (!text) continue;
      const el = document.createElement("div");
      el.className = "stl-label";
      el.textContent = text;
      if (interactive) el.addEventListener("click", () => btn.click());
      this.container.append(el);
      this.entries.push({ btn, el });
    }
    document.body.append(this.container);
  }

  tick = () => {
    if (!this.visible) return;
    // Buttons get replaced when Foundry re-renders (e.g. switching layers changes the tools)
    if (this.entries.some(e => !e.btn.isConnected)) {
      this.stripNativeTooltips();
      this.build();
      this.entries.forEach(e => e.el.classList.add("visible"));
    }
    const width = document.documentElement.clientWidth;
    for (const { btn, el } of this.entries) {
      const r = btn.getBoundingClientRect();
      el.style.top = `${r.top + r.height / 2}px`;
      if (this.side === "left") el.style.right = `${width - r.left}px`;
      else el.style.left = `${r.right}px`;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  // Called whenever the pointer is over this group; honors the "show delay" setting.
  requestShow() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.removeTimer);
    this.stripNativeTooltips();
    if (this.visible || this.showTimer) return;
    const delay = getSetting("showDelay");
    if (!delay) return this.show();
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.show();
    }, delay);
  }

  // The pointer left before the show delay elapsed.
  cancelShow() {
    if (!this.showTimer) return;
    clearTimeout(this.showTimer);
    this.showTimer = null;
    this.restoreNativeTooltips();
  }

  show() {
    clearTimeout(this.removeTimer);
    clearTimeout(this.hideTimer);
    if (this.visible) return;
    this.visible = true;
    this.stripNativeTooltips();
    this.build();
    this.tick();
    requestAnimationFrame(() => this.entries.forEach(e => e.el.classList.add("visible")));
  }

  scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), getSetting("hideDelay"));
  }

  hide(immediate = false) {
    clearTimeout(this.hideTimer);
    this.cancelShow();
    if (!this.visible) return;
    this.visible = false;
    cancelAnimationFrame(this.raf);
    this.restoreNativeTooltips();
    const cleanup = () => {
      if (this.visible) return;
      this.container?.remove();
      this.container = null;
      this.entries = [];
    };
    if (immediate || !getSetting("animate")) return cleanup();
    this.entries.forEach(e => e.el.classList.remove("visible", "active"));
    this.removeTimer = setTimeout(cleanup, FADE_MS);
  }

  setActive(target) {
    const highlight = getSetting("highlightHovered");
    const btn = target.closest?.(`${this.selector} button`);
    const label = target.closest?.(".stl-label");
    for (const e of this.entries) {
      e.el.classList.toggle("active", highlight && (e.btn === btn || e.el === label));
    }
  }
}

const groups = [
  {
    id: "sidebar", selector: "#sidebar-tabs", side: "left", interactive: true,
    enabled: () => getSetting("sidebar")
  },
  {
    id: "layers", selector: "#scene-controls-layers", side: "right", interactive: false,
    enabled: () => ["both", "layers"].includes(getSetting("sceneControls"))
  },
  {
    id: "tools", selector: "#scene-controls-tools", side: "right", interactive: true,
    enabled: () => ["both", "tools"].includes(getSetting("sceneControls"))
  }
].map(cfg => new LabelGroup(cfg));

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function applyStyles() {
  document.documentElement.style.setProperty("--stl-font-size", `${getSetting("fontSize")}px`);
  document.body.classList.toggle("stl-no-animate", !getSetting("animate"));
}

function onSettingChange() {
  groups.forEach(g => g.hide(true));
  applyStyles();
}

function registerSettings() {
  const base = { scope: "client", config: true, onChange: onSettingChange };
  const loc = key => `SIDEBAR_BUTTON_LABELS.settings.${key}`;
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    ...base, name: loc(`${key}.name`), hint: loc(`${key}.hint`), ...data
  });

  reg("enabled",          { type: Boolean, default: true });
  reg("sidebar",          { type: Boolean, default: true });
  reg("sceneControls",    {
    type: String,
    default: "both",
    choices: {
      both: loc("sceneControls.choices.both"),
      layers: loc("sceneControls.choices.layers"),
      tools: loc("sceneControls.choices.tools"),
      none: loc("sceneControls.choices.none")
    }
  });
  reg("clickableLabels",  { type: Boolean, default: true });
  reg("highlightHovered", { type: Boolean, default: true });
  reg("animate",          { type: Boolean, default: true });
  reg("showDelay",        { type: Number, default: 0,   range: { min: 0, max: 1000, step: 50 } });
  reg("hideDelay",        { type: Number, default: 150, range: { min: 0, max: 1000, step: 50 } });
  reg("fontSize",         { type: Number, default: 14,  range: { min: 10, max: 24, step: 1 } });
}

/* -------------------------------------------- */
/*  Event handling                              */
/* -------------------------------------------- */

function onPointerOver(ev) {
  for (const group of groups) {
    if (!group.contains(ev.target)) continue;
    if (!group.isEnabled()) return;
    // Only one group's labels at a time, so they never overlap
    groups.forEach(g => { if (g !== group) g.hide(true); });
    group.requestShow();
    group.setActive(ev.target);
    return;
  }
}

function onPointerOut(ev) {
  for (const group of groups) {
    if (!group.contains(ev.target) || group.contains(ev.relatedTarget)) continue;
    if (group.visible) group.scheduleHide();
    else group.cancelShow();
  }
}

Hooks.once("init", registerSettings);

Hooks.once("ready", () => {
  applyStyles();
  document.addEventListener("pointerover", onPointerOver, true);
  document.addEventListener("pointerout", onPointerOut, true);
});