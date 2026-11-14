(() => {
  "use strict";

  const STORAGE_KEY = "studykaki-v1";
  const SINGAPORE = "Asia/Singapore";
  const DAY_MS = 86_400_000;
  const MAX_LINK_LENGTH = 4_000;
  const MODES = { silent: "Silent focus", module: "Module study" };
  const DATE_OPTIONS = { timeZone: SINGAPORE };
  const DATE_KEY = new Intl.DateTimeFormat("en-CA", {
    ...DATE_OPTIONS, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const SHORT_DATE = new Intl.DateTimeFormat("en-SG", {
    ...DATE_OPTIONS, weekday: "short", day: "numeric", month: "short",
  });
  const CLOCK = new Intl.DateTimeFormat("en-SG", {
    ...DATE_OPTIONS, hour: "numeric", minute: "2-digit", hour12: true,
  });
  const PATHS = {
    silent: '<path d="M4 13v-1a8 8 0 0 1 16 0v1M6 12H4v6a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H6Zm12 0h2v6a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1Z"/>',
    module: '<path d="M12 6v14m0-14C9 4 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    pin: '<path d="M20 10c0 5-8 10-8 10S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    people: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-3-11a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    bookmark: '<path d="M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z"/>',
  };

  const grid = document.querySelector("#session-grid");
  const createDialog = document.querySelector("#create-dialog");
  const createForm = document.querySelector("#create-form");
  const detailDialog = document.querySelector("#detail-dialog");
  const detailContent = document.querySelector("#detail-content");
  const profileDialog = document.querySelector("#profile-dialog");
  const profileForm = document.querySelector("#profile-form");
  const search = document.querySelector("#search");
  const dayControl = document.querySelector("#day-filter");
  const venueControl = document.querySelector("#venue-filter");
  const standardVenues = new Set(Array.from(venueControl?.options || [], (option) => option.value));
  const toast = document.querySelector("#app-toast");

  const savedState = readState();
  const demos = createDemoSessions();
  let activeView = "browse";
  let activeMode = "all";
  let activeDay = "all";
  let activeDetail = null;
  let detailOpener = null;
  let toastTimeout;

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function button(className, label, click) {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", click);
    return node;
  }

  function icon(name, className = "icon") {
    const wrapper = element("span", className);
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
    return wrapper;
  }

  function singaporeDate(value = new Date()) {
    const parts = Object.fromEntries(
      DATE_KEY.formatToParts(value).map(({ type, value: part }) => [type, part]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function relativeDate(days) {
    const today = Date.parse(`${singaporeDate()}T00:00:00+08:00`);
    return singaporeDate(new Date(today + days * DAY_MS));
  }

  function startTime(session) {
    return new Date(`${session.date}T${session.time}:00+08:00`);
  }

  function readText(value, maxLength) {
    return typeof value === "string" && value.length <= maxLength &&
      !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value) ? value.trim() : "";
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00+08:00`);
    return Number.isFinite(date.valueOf()) && singaporeDate(date) === value;
  }

  function sessionFromData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { id, mode, date, time, duration, capacity } = value;
    const title = readText(value.title, 72);
    const venue = readText(value.venue, 80);
    const moduleCode = readText(value.module, 24);
    const notes = readText(value.notes, 360);
    if (typeof id !== "string" || !/^[a-f\d]{32}$/.test(id) ||
        typeof mode !== "string" || !Object.hasOwn(MODES, mode) || !title || !venue ||
        !validDate(date) || typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
        !Number.isInteger(duration) || duration < 15 || duration > 240 ||
        !Number.isInteger(capacity) || capacity < 2 || capacity > 30 ||
        typeof value.notes !== "string" || notes !== value.notes.trim() ||
        typeof value.module !== "string" || moduleCode !== value.module.trim()) return null;

    return {
      id, title, mode, module: moduleCode, venue, date, time, duration, capacity, notes,
    };
  }

  function profileFromData(value = {}) {
    if (!value || typeof value !== "object") value = {};
    return {
      name: readText(value.name, 60),
      school: readText(value.school, 90),
      year: readText(value.year, 25),
      nickname: readText(value.nickname, 32),
    };
  }

  function readState() {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      raw = null;
    }
    const sessions = Array.isArray(raw?.sessions) ? raw.sessions.flatMap((record) => {
      const session = sessionFromData(record);
      return session ? [{ ...session, owned: record.owned === true }] : [];
    }) : [];
    const ids = (value) => Array.isArray(value) ?
      value.filter((id) => typeof id === "string" && /^(demo-[1-6]|[a-f\d]{32})$/.test(id)) : [];
    return {
      sessions, joined: new Set(ids(raw?.joined)), saved: new Set(ids(raw?.saved)),
      profile: profileFromData(raw?.profile),
    };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessions: savedState.sessions,
        joined: [...savedState.joined],
        saved: [...savedState.saved],
        profile: savedState.profile,
      }));
      return true;
    } catch {
      return false;
    }
  }

  function notify(message) {
    if (!toast) return;
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.hidden = false;
    toastTimeout = setTimeout(() => { toast.hidden = true; }, 4_500);
  }

  function saveAndNotify(message) {
    notify(persist() ? message : `${message} Browser storage is unavailable for this visit.`);
  }

  function createDemoSessions() {
    const examples = [
      ["Deep focus at Lee Wee Nam", "silent", "", "Lee Wee Nam Library", 0, "15:00", 90, 6, 4,
        "Bring whatever you’re working on. Two quiet focus blocks with a short break in between."],
      ["BG3104 MRI revision", "module", "BG3104", "The Hive", 0, "17:30", 60, 5, 3,
        "Work through MRI tutorial questions and compare approaches before the exam."],
      ["Evening catch-up at The Arc", "silent", "", "The Arc", 0, "19:00", 60, 8, 3,
        "A low-key hour for lectures, notes, or readings. Bring headphones if you need them."],
      ["MH1810 problem-solving", "module", "MH1810", "The Hive", 1, "11:00", 90, 6, 5,
        "Bring a couple of calculus questions to work through together."],
      ["Quiet afternoon reset", "silent", "", "Lee Wee Nam Library", 1, "14:00", 60, 5, 2,
        "Set one task and spend an hour getting through it in good company."],
      ["BG3102 control systems review", "module", "BG3102", "The Arc", 2, "16:00", 90, 5, 5,
        "Practice Bode plots and compare step-by-step answers with coursemates."],
    ];

    return examples.map(([title, mode, module, venue, offset, time, duration, capacity, attending, notes], index) => ({
      id: `demo-${index + 1}`, demo: true, title, mode, module, venue,
      date: relativeDate(offset), time, duration, capacity, attending, notes,
    }));
  }

  function timeLabel(session) {
    const start = startTime(session);
    const finish = new Date(start.valueOf() + session.duration * 60_000);
    const date = session.date === relativeDate(0) ? "Today" :
      session.date === relativeDate(1) ? "Tomorrow" : SHORT_DATE.format(start);
    return `${date}, ${CLOCK.format(start)} – ${CLOCK.format(finish)}`;
  }

  function joined(session) {
    return session.owned || savedState.joined.has(session.id);
  }

  function isFull(session) {
    return session.demo && !joined(session) && session.attending >= session.capacity;
  }

  function capacityLabel(session) {
    if (!session.demo) return `Up to ${session.capacity} people`;
    const spots = session.capacity - session.attending - Number(joined(session));
    if (spots === 0) return "Full";
    return `${spots} ${spots === 1 ? "spot" : "spots"} left`;
  }

  function cardFor(session) {
    const card = element("article", "study-card");
    card.dataset.mode = session.mode;
    const top = element("div", "card-top");
    top.append(icon(session.mode, "card-icon"));
    const badges = element("div", "card-badges");
    badges.append(element("span", "card-mode", MODES[session.mode]));
    if (session.demo) badges.append(element("span", "card-demo", "Demo"));

    const isSaved = savedState.saved.has(session.id);
    const save = button("card-save", undefined, () => {
      toggleSaved(session);
      grid.querySelector(`[data-session-id="${session.id}"] .card-save`)?.focus();
    });
    save.setAttribute("aria-label", `Save ${session.title}`);
    save.setAttribute("aria-pressed", String(isSaved));
    save.title = isSaved ? "Remove bookmark" : "Save session";
    save.append(icon("bookmark"));
    badges.append(save);
    if (!session.demo) {
      const share = button("card-share", undefined, () => copyLink(session));
      share.setAttribute("aria-label", `Copy link to ${session.title}`);
      share.title = "Copy share link";
      share.append(icon("share"));
      badges.append(share);
    }
    top.append(badges);
    card.dataset.sessionId = session.id;
    card.append(top, element("h3", "card-title", session.title),
      element("p", "card-description", session.notes || session.module || "Bring your study materials."));

    const metadata = element("div", "card-meta");
    for (const [symbol, value] of [["calendar", timeLabel(session)], ["pin", session.venue]]) {
      const row = element("div", "card-meta-row");
      row.append(icon(symbol), element("span", "", value));
      metadata.append(row);
    }
    const footer = element("div", "card-footer");
    const capacity = element("span", "card-capacity");
    capacity.append(icon("people"), element("span", "", capacityLabel(session)));
    const open = button("card-open", "View session", () => openDetail(session, open));
    open.append(icon("arrow"));
    footer.append(capacity, open);
    card.append(metadata, footer);
    return card;
  }

  function matchesDay(session) {
    switch (activeDay) {
      case "today": return session.date === relativeDate(0);
      case "tomorrow": return session.date === relativeDate(1);
      case "week": return session.date >= relativeDate(0) && session.date <= relativeDate(6);
      default: return true;
    }
  }

  function visibleSessions() {
    const query = search.value.trim().toLowerCase();
    const venue = venueControl?.value;
    return [...demos, ...savedState.sessions].filter((session) =>
      (activeView !== "mine" || joined(session)) &&
      (activeView !== "saved" || savedState.saved.has(session.id)) &&
      (activeMode === "all" || session.mode === activeMode) &&
      (!venue || venue === "all" || session.venue.toLowerCase() === venue.toLowerCase()) &&
      matchesDay(session) &&
      (!query || [session.title, session.module, session.venue, session.notes]
        .some((field) => field.toLowerCase().includes(query))),
    ).sort((first, second) => startTime(first) - startTime(second));
  }

  function updateFilters() {
    for (const [selector, property, value] of [
      ["[data-view]", "view", activeView],
      ["[data-mode]", "mode", activeMode],
      ["[data-day]", "day", activeDay],
    ]) {
      for (const control of document.querySelectorAll(selector)) {
        if (control.tagName !== "BUTTON" && control.tagName !== "A") continue;
        const active = control.dataset[property] === value;
        control.classList.toggle("active", active);
        control.setAttribute("aria-pressed", String(active));
      }
    }
  }

  function render() {
    updateVenues();
    const sessions = visibleSessions();
    updateFilters();
    document.querySelector("#directory-title").textContent = {
      browse: "Study sessions", mine: "My sessions", saved: "Saved sessions",
    }[activeView];
    document.querySelector("#result-count").textContent =
      `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`;
    grid.replaceChildren(...sessions.map(cardFor));
    if (sessions.length) return;

    const empty = element("div", "directory-empty");
    empty.append(element("h3", "", "No sessions found"));
    const filtersOn = Boolean(search.value || activeMode !== "all" || activeDay !== "all" ||
      (venueControl?.value && venueControl.value !== "all"));
    const emptyMessages = {
      browse: "Create a session to get started.",
      mine: "Sessions you join or host will appear here.",
      saved: "Bookmark a session to find it here later.",
    };
    empty.append(element("p", "", filtersOn ? "Try a different search or clear your filters." :
      emptyMessages[activeView]));
    if (filtersOn) empty.append(button("button button-secondary", "Clear filters", () => {
      resetFilters();
      render();
    }));
    grid.append(empty);
  }

  function updateVenues() {
    if (!venueControl) return;
    const selected = venueControl.value;
    venueControl.querySelectorAll("[data-custom-venue]").forEach((option) => option.remove());
    const known = new Set(Array.from(standardVenues, (venue) => venue.toLowerCase()));
    for (const { venue } of savedState.sessions) {
      const key = venue.toLowerCase();
      if (!known.has(key)) {
        known.add(key);
        const option = new Option(venue, venue);
        option.dataset.customVenue = "";
        venueControl.append(option);
      }
    }
    venueControl.value = Array.from(venueControl.options, (option) => option.value)
      .find((venue) => venue.toLowerCase() === selected.toLowerCase()) || "all";
  }

  function resetFilters() {
    search.value = "";
    activeMode = "all";
    activeDay = "all";
    if (dayControl) dayControl.value = "all";
    if (venueControl) venueControl.value = "all";
  }

  function selectView(view) {
    if (activeView !== view) resetFilters();
    activeView = view;
    render();
  }

  function toggleSaved(session) {
    const wasSaved = savedState.saved.delete(session.id);
    if (!wasSaved) savedState.saved.add(session.id);
    saveAndNotify(wasSaved ? "Bookmark removed." : "Session saved.");
    render();
    if (activeDetail) showDetail(activeDetail);
  }

  function showDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  function openDetail(session, opener) {
    activeDetail = session;
    detailOpener = opener || null;
    showDetail(session);
    showDialog(detailDialog);
  }

  function showDetail(session) {
    const header = element("div", "detail-header");
    const label = session.demo ? `${MODES[session.mode]} · Demo` : MODES[session.mode];
    header.append(element("p", "detail-kicker", label), element("h2", "", session.title));
    header.querySelector("h2").id = "detail-title";
    if (session.notes) header.append(element("p", "detail-description", session.notes));

    const metadata = element("dl", "detail-meta");
    const fields = [
      ["Time (SGT)", timeLabel(session)], ["Location", session.venue],
      ["Duration", `${session.duration} minutes`], ["Group size", capacityLabel(session)],
    ];
    if (session.module) fields.push(["Module", session.module]);
    for (const [term, value] of fields) {
      const row = element("div", "detail-meta-row");
      row.append(element("dt", "", term), element("dd", "", value));
      metadata.append(row);
    }
    const note = session.demo ? "This is an example session. Participation is simulated." :
      session.owned ? "You are hosting. Share the link to send these details to other students." :
        "Adding this plan only updates this browser. Confirm attendance directly with the host.";
    const actions = element("div", "detail-actions");
    const wasSaved = savedState.saved.has(session.id);
    actions.append(button("button button-secondary detail-save", wasSaved ? "Remove bookmark" : "Save session", () => {
      toggleSaved(session);
      detailContent.querySelector(".detail-save")?.focus();
    }));
    if (!session.demo) {
      actions.append(button("button button-secondary", "Copy share link", () => copyLink(session)));
    }
    actions.append(button("button button-secondary", "Add to calendar", () => downloadCalendar(session)));
    if (session.owned) {
      actions.append(button("button button-secondary", "Delete session", () => deleteSession(session)));
    } else {
      if (!session.demo) actions.append(button("button button-secondary", "Remove from this browser", () => deleteSession(session)));
      const label = joined(session) ? (session.demo ? "Leave demo session" : "Remove from my sessions") :
        (session.demo ? "Join demo session" : "Add to my sessions");
      const toggle = button("button button-primary", isFull(session) ? "Session full" : label, () => {
        toggleJoined(session);
        detailContent.querySelector(".button-primary")?.focus();
      });
      toggle.disabled = isFull(session);
      actions.append(toggle);
    }
    detailContent.replaceChildren(header, metadata, element("p", "detail-note", note), actions);
  }

  function toggleJoined(session) {
    if (isFull(session)) return;
    const wasJoined = savedState.joined.delete(session.id);
    if (!wasJoined) savedState.joined.add(session.id);
    saveAndNotify(wasJoined ? "Session removed from your plans." : "Session added to your plans.");
    render();
    showDetail(session);
  }

  function deleteSession(session) {
    const prompt = session.owned ? "Delete this session from this browser? Copies already shared by link can still be opened." :
      "Remove this session from this browser? You can reopen it with the original link.";
    if (!window.confirm(prompt)) return;
    savedState.sessions = savedState.sessions.filter(({ id }) => id !== session.id);
    savedState.joined.delete(session.id);
    savedState.saved.delete(session.id);
    saveAndNotify(session.owned ? "Session deleted." : "Session removed from this browser.");
    detailDialog.close();
    if (location.hash.startsWith("#session=")) history.replaceState(null, "", location.pathname + location.search);
    render();
  }

  function openCreate() {
    createForm.reset();
    createForm.elements.date.min = relativeDate(0);
    createForm.elements.date.value = relativeDate(1);
    createForm.elements.time.value ||= "18:00";
    showCreateError("");
    showDialog(createDialog);
  }

  function showCreateError(message) {
    const target = document.querySelector("#create-error");
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
  }

  function createSession(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(createForm));
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const session = sessionFromData({
      ...data, id, module: data.module || "", notes: data.notes || "",
      capacity: Number(data.capacity), duration: Number(data.duration),
    });
    if (!session) {
      showCreateError("Check the title, location, time, duration and group size.");
      return;
    }
    if (startTime(session).valueOf() < Date.now()) {
      showCreateError("Choose a start time in the future (Singapore time).");
      createForm.elements.date.focus();
      return;
    }
    const ownedSession = { ...session, owned: true };
    savedState.sessions.push(ownedSession);
    createDialog.close();
    selectView("mine");
    openDetail(ownedSession, grid.querySelector(`[data-session-id="${id}"] .card-open`));
    saveAndNotify("Session created. Copy the link to share it.");
  }

  function shareUrl(session) {
    const data = { version: 1, session: sessionFromData(session) };
    const url = new URL(location.href);
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const encoded = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    url.hash = `session=${encoded}`;
    return url.href;
  }

  async function copyLink(session) {
    const url = shareUrl(session);
    try {
      await navigator.clipboard.writeText(url);
      notify("Share link copied.");
    } catch {
      window.prompt("Copy this session link:", url);
    }
  }

  function openSharedSession() {
    if (!location.hash.startsWith("#session=")) return;
    if (location.hash.length > MAX_LINK_LENGTH) {
      notify("This study session link is invalid.");
      return;
    }
    let shared;
    try {
      const encoded = location.hash.slice("#session=".length);
      if (/^[A-Za-z0-9_-]+$/.test(encoded)) {
        const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
          (character) => character.charCodeAt(0));
        const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (data?.version === 1) shared = sessionFromData(data.session);
      }
    } catch {
      shared = null;
    }
    if (!shared) {
      notify("This study session link is invalid.");
      return;
    }
    const existing = savedState.sessions.find(({ id }) => id === shared.id);
    if (!existing) {
      savedState.sessions.push(shared);
      persist();
    }
    render();
    openDetail(existing || shared);
  }

  function calendarText(value) {
    return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
      .replace(/;/g, "\\;").replace(/,/g, "\\,");
  }

  function calendarDate(date) {
    return date.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  }

  function foldCalendarLine(line) {
    const encoder = new TextEncoder();
    let folded = "";
    let length = 0;
    for (const character of line) {
      const bytes = encoder.encode(character).length;
      if (length + bytes > 75) {
        folded += "\r\n ";
        length = 1;
      }
      folded += character;
      length += bytes;
    }
    return folded;
  }

  function downloadCalendar(session) {
    const start = startTime(session);
    const end = new Date(start.valueOf() + session.duration * 60_000);
    const subject = session.demo ? `[Demo] ${session.title}` : session.title;
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyKaki//Study Sessions//EN",
      "BEGIN:VEVENT", `UID:${session.demo ? `${session.id}-${session.date}` : session.id}@studykaki.local`,
      `DTSTAMP:${calendarDate(new Date())}`,
      `DTSTART:${calendarDate(start)}`, `DTEND:${calendarDate(end)}`,
      `SUMMARY:${calendarText(subject)}`, `LOCATION:${calendarText(session.venue)}`,
      `DESCRIPTION:${calendarText(session.notes)}`,
      "END:VEVENT", "END:VCALENDAR", "",
    ];
    const data = new Blob([lines.map(foldCalendarLine).join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(data);
    const link = element("a");
    link.href = url;
    link.download = `studykaki-${session.id.slice(0, 8)}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
    notify("Calendar file downloaded.");
  }

  function profileControl(name) {
    return profileForm.elements.namedItem(name === "school" && !profileForm.elements.namedItem("school") ?
      "course" : name);
  }

  function openProfile() {
    for (const [name, value] of Object.entries(savedState.profile)) {
      const control = profileControl(name);
      if (control) control.value = value;
    }
    showDialog(profileDialog);
  }

  function renderProfile() {
    for (const label of document.querySelectorAll("#profile-name, [data-profile-name]")) {
      label.textContent = savedState.profile.nickname || savedState.profile.name || "My profile";
    }
  }

  function saveProfile(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(profileForm));
    const profile = profileFromData({ ...data, school: data.school ?? data.course });
    for (const field of ["name", "school", "year"]) {
      const control = profileControl(field);
      if (control?.required && !profile[field]) {
        control.setCustomValidity("Enter a value for this field.");
        control.addEventListener("input", () => control.setCustomValidity(""), { once: true });
        control.reportValidity();
        return;
      }
    }
    savedState.profile = profile;
    saveAndNotify("Profile saved in this browser.");
    profileDialog.close();
    renderProfile();
  }

  for (const control of document.querySelectorAll("#open-create, [data-open-create]")) {
    control.addEventListener("click", openCreate);
  }
  for (const control of document.querySelectorAll("#open-profile, [data-open-profile]")) {
    control.addEventListener("click", openProfile);
  }
  for (const control of document.querySelectorAll("[data-close-dialog]")) {
    control.addEventListener("click", () => control.closest("dialog")?.close());
  }
  for (const control of document.querySelectorAll("[data-view]")) {
    if (!["BUTTON", "A"].includes(control.tagName)) continue;
    control.addEventListener("click", () => selectView(control.dataset.view));
  }
  for (const control of document.querySelectorAll("[data-mode]")) {
    if (!["BUTTON", "A"].includes(control.tagName)) continue;
    control.addEventListener("click", () => { activeMode = control.dataset.mode; render(); });
  }
  for (const control of document.querySelectorAll("[data-day]")) {
    control.addEventListener("click", () => { activeDay = control.dataset.day; render(); });
  }
  search.addEventListener("input", render);
  dayControl?.addEventListener("change", () => { activeDay = dayControl.value; render(); });
  venueControl?.addEventListener("change", render);
  createForm.addEventListener("submit", createSession);
  profileForm.addEventListener("submit", saveProfile);
  document.querySelector("#clear-profile")?.addEventListener("click", () => {
    savedState.profile = profileFromData();
    profileForm.reset();
    saveAndNotify("Profile cleared from this browser.");
    renderProfile();
  });
  detailDialog.addEventListener("close", () => {
    const next = activeDetail && grid.querySelector(`[data-session-id="${activeDetail.id}"] .card-open`);
    (next || detailOpener)?.focus();
    activeDetail = null;
    detailOpener = null;
  });
  window.addEventListener("hashchange", openSharedSession);
  render();
  renderProfile();
  openSharedSession();
})();
