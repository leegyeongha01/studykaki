(() => {
  "use strict";

  const STORAGE_KEY = "studykaki-v1";
  const SINGAPORE = "Asia/Singapore";
  const DAY_MS = 86_400_000;
  const MAX_LINK_LENGTH = 4_000;
  const MODES = { silent: "조용히 각자 공부", module: "과목 스터디" };
  const MODE_SEARCH_ALIASES = { silent: "Silent focus", module: "Module study" };
  const VENUE_LABELS = {
    "Lee Wee Nam Library": "리위남 도서관", "The Hive": "더 하이브", "The Arc": "더 아크",
  };
  const VENUE_KEYS = new Map(Object.entries(VENUE_LABELS).flatMap(([key, label]) =>
    [[key.toLowerCase(), key], [label, key]],
  ));
  const DATE_OPTIONS = { timeZone: SINGAPORE };
  const DATE_KEY = new Intl.DateTimeFormat("en-CA", {
    ...DATE_OPTIONS, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const SHORT_DATE = new Intl.DateTimeFormat("ko-KR", {
    ...DATE_OPTIONS, weekday: "short", day: "numeric", month: "long",
  });
  const CLOCK = new Intl.DateTimeFormat("ko-KR", {
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
  const standardVenues = new Set(Array.from(venueControl?.options || [], (option) => canonicalVenue(option.value)));
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

  function canonicalVenue(venue) {
    return VENUE_KEYS.get(venue.toLowerCase()) || venue;
  }

  function venueLabel(venue) {
    const canonical = canonicalVenue(venue);
    return Object.hasOwn(VENUE_LABELS, canonical) ? VENUE_LABELS[canonical] : venue;
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
    notify(persist() ? message : `${message} 지금은 브라우저에 저장할 수 없어요.`);
  }

  function createDemoSessions() {
    const examples = [
      ["리위남 도서관에서 집중 공부", "silent", "", "Lee Wee Nam Library", 0, "15:00", 90, 6, 4,
        "각자 공부할 거리를 가져오세요. 두 번 집중해서 공부하고 중간에 잠깐 쉬어요."],
      ["BG3104 MRI 복습", "module", "BG3104", "The Hive", 0, "17:30", 60, 5, 3,
        "시험 전에 MRI 튜토리얼 문제를 풀고 풀이를 비교해요."],
      ["더 아크 저녁 자습", "silent", "", "The Arc", 0, "19:00", 60, 8, 3,
        "밀린 강의나 필기를 정리하며 한 시간 공부해요. 필요하면 이어폰을 가져오세요."],
      ["MH1810 문제 풀이", "module", "MH1810", "The Hive", 1, "11:00", 90, 6, 5,
        "함께 풀어 보고 싶은 미적분 문제를 한두 개 가져오세요."],
      ["조용한 오후 자습", "silent", "", "Lee Wee Nam Library", 1, "14:00", 60, 5, 2,
        "오늘 할 일 하나를 정하고 한 시간 동안 함께 집중해요."],
      ["BG3102 제어 시스템 복습", "module", "BG3102", "The Arc", 2, "16:00", 90, 5, 5,
        "보드 선도(Bode plot)를 그려 보고 풀이를 단계별로 비교해요."],
    ];

    return examples.map(([title, mode, module, venue, offset, time, duration, capacity, attending, notes], index) => ({
      id: `demo-${index + 1}`, demo: true, title, mode, module, venue,
      date: relativeDate(offset), time, duration, capacity, attending, notes,
    }));
  }

  function timeLabel(session) {
    const start = startTime(session);
    const finish = new Date(start.valueOf() + session.duration * 60_000);
    const date = session.date === relativeDate(0) ? "오늘" :
      session.date === relativeDate(1) ? "내일" : SHORT_DATE.format(start);
    return `${date} ${CLOCK.format(start)} ~ ${CLOCK.format(finish)}`;
  }

  function joined(session) {
    return session.owned || savedState.joined.has(session.id);
  }

  function isFull(session) {
    return session.demo && !joined(session) && session.attending >= session.capacity;
  }

  function capacityLabel(session) {
    if (!session.demo) return `최대 ${session.capacity}명`;
    const spots = session.capacity - session.attending - Number(joined(session));
    if (spots === 0) return "정원 마감";
    return `${spots}명 참여 가능`;
  }

  function cardFor(session) {
    const card = element("article", "study-card");
    card.dataset.mode = session.mode;
    const top = element("div", "card-top");
    top.append(icon(session.mode, "card-icon"));
    const badges = element("div", "card-badges");
    badges.append(element("span", "card-mode", MODES[session.mode]));
    if (session.demo) badges.append(element("span", "card-demo", "예시"));

    const isSaved = savedState.saved.has(session.id);
    const save = button("card-save", undefined, () => {
      toggleSaved(session);
      grid.querySelector(`[data-session-id="${session.id}"] .card-save`)?.focus();
    });
    save.setAttribute("aria-label", `${session.title} 저장`);
    save.setAttribute("aria-pressed", String(isSaved));
    save.title = isSaved ? "북마크 삭제" : "모임 저장";
    save.append(icon("bookmark"));
    badges.append(save);
    if (!session.demo) {
      const share = button("card-share", undefined, () => copyLink(session));
      share.setAttribute("aria-label", `${session.title} 공유 링크 복사`);
      share.title = "공유 링크 복사";
      share.append(icon("share"));
      badges.append(share);
    }
    top.append(badges);
    card.dataset.sessionId = session.id;
    card.append(top, element("h3", "card-title", session.title),
      element("p", "card-description", session.notes || session.module || "각자 공부할 자료를 가져오세요."));

    const metadata = element("div", "card-meta");
    for (const [symbol, value] of [["calendar", timeLabel(session)], ["pin", venueLabel(session.venue)]]) {
      const row = element("div", "card-meta-row");
      row.append(icon(symbol), element("span", "", value));
      metadata.append(row);
    }
    const footer = element("div", "card-footer");
    const capacity = element("span", "card-capacity");
    capacity.append(icon("people"), element("span", "", capacityLabel(session)));
    const open = button("card-open", "모임 보기", () => openDetail(session, open));
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
      (!venue || venue === "all" || canonicalVenue(session.venue).toLowerCase() === canonicalVenue(venue).toLowerCase()) &&
      matchesDay(session) &&
      (!query || [session.title, session.module, canonicalVenue(session.venue), venueLabel(session.venue),
        session.notes, MODES[session.mode], MODE_SEARCH_ALIASES[session.mode]]
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
      browse: "스터디 모임", mine: "내 모임", saved: "저장한 모임",
    }[activeView];
    document.querySelector("#result-count").textContent =
      `모임 ${sessions.length}개`;
    grid.replaceChildren(...sessions.map(cardFor));
    if (sessions.length) return;

    const empty = element("div", "directory-empty");
    empty.append(element("h3", "", "표시할 모임이 없어요"));
    const filtersOn = Boolean(search.value || activeMode !== "all" || activeDay !== "all" ||
      (venueControl?.value && venueControl.value !== "all"));
    const emptyMessages = {
      browse: "새 모임을 만들고 함께 공부해 보세요.",
      mine: "직접 만들거나 내 모임에 추가한 스터디가 여기에 표시돼요.",
      saved: "관심 있는 모임을 저장하면 여기에서 다시 볼 수 있어요.",
    };
    empty.append(element("p", "", filtersOn ? "다른 검색어로 찾아보거나 필터를 초기화해 보세요." :
      emptyMessages[activeView]));
    if (filtersOn) empty.append(button("button button-secondary", "필터 초기화", () => {
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
      const key = canonicalVenue(venue).toLowerCase();
      if (!known.has(key)) {
        known.add(key);
        const option = new Option(venueLabel(venue), canonicalVenue(venue));
        option.dataset.customVenue = "";
        venueControl.append(option);
      }
    }
    venueControl.value = Array.from(venueControl.options, (option) => option.value)
      .find((venue) => canonicalVenue(venue).toLowerCase() === canonicalVenue(selected).toLowerCase()) || "all";
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
    saveAndNotify(wasSaved ? "북마크를 삭제했어요." : "모임을 저장했어요.");
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
    const label = session.demo ? `${MODES[session.mode]} · 예시` : MODES[session.mode];
    header.append(element("p", "detail-kicker", label), element("h2", "", session.title));
    header.querySelector("h2").id = "detail-title";
    if (session.notes) header.append(element("p", "detail-description", session.notes));

    const metadata = element("dl", "detail-meta");
    const fields = [
      ["시간 (싱가포르 기준)", timeLabel(session)], ["장소", venueLabel(session.venue)],
      ["소요 시간", `${session.duration}분`], ["인원", capacityLabel(session)],
    ];
    if (session.module) fields.push(["과목", session.module]);
    for (const [term, value] of fields) {
      const row = element("div", "detail-meta-row");
      row.append(element("dt", "", term), element("dd", "", value));
      metadata.append(row);
    }
    const note = session.demo ? "예시 모임에서 참여 기능을 체험해 볼 수 있어요." :
      session.owned ? "내가 만든 모임이에요. 링크를 보내면 친구도 모임 정보를 볼 수 있어요." :
        "내 모임에 추가하면 이 브라우저에 저장돼요. 실제 참석 여부는 주최자에게 직접 알려 주세요.";
    const actions = element("div", "detail-actions");
    const wasSaved = savedState.saved.has(session.id);
    actions.append(button("button button-secondary detail-save", wasSaved ? "북마크 삭제" : "모임 저장", () => {
      toggleSaved(session);
      detailContent.querySelector(".detail-save")?.focus();
    }));
    if (!session.demo) {
      actions.append(button("button button-secondary", "공유 링크 복사", () => copyLink(session)));
    }
    actions.append(button("button button-secondary", "캘린더에 추가", () => downloadCalendar(session)));
    if (session.owned) {
      actions.append(button("button button-secondary", "모임 삭제", () => deleteSession(session)));
    } else {
      if (!session.demo) actions.append(button("button button-secondary", "이 브라우저에서 삭제", () => deleteSession(session)));
      const label = joined(session) ? (session.demo ? "예시 모임 나가기" : "내 모임에서 제거") :
        (session.demo ? "예시 모임 참여" : "내 모임에 추가");
      const toggle = button("button button-primary", isFull(session) ? "정원 마감" : label, () => {
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
    saveAndNotify(wasJoined ? "내 모임에서 제거했어요." : "내 모임에 추가했어요.");
    render();
    showDetail(session);
  }

  function deleteSession(session) {
    const prompt = session.owned ? "이 브라우저에서 모임을 삭제할까요? 이미 공유한 링크는 계속 열 수 있어요." :
      "이 브라우저에서 모임을 삭제할까요? 받은 링크로 언제든 다시 열 수 있어요.";
    if (!window.confirm(prompt)) return;
    savedState.sessions = savedState.sessions.filter(({ id }) => id !== session.id);
    savedState.joined.delete(session.id);
    savedState.saved.delete(session.id);
    saveAndNotify(session.owned ? "모임을 삭제했어요." : "이 브라우저에서 모임을 삭제했어요.");
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
      venue: canonicalVenue(readText(data.venue, 80)),
      capacity: Number(data.capacity), duration: Number(data.duration),
    });
    if (!session) {
      showCreateError("제목, 장소, 시간, 소요 시간, 인원을 확인해 주세요.");
      return;
    }
    if (startTime(session).valueOf() < Date.now()) {
      showCreateError("싱가포르 기준으로 현재 시각 이후의 시간을 골라 주세요.");
      createForm.elements.date.focus();
      return;
    }
    const ownedSession = { ...session, owned: true };
    savedState.sessions.push(ownedSession);
    createDialog.close();
    selectView("mine");
    openDetail(ownedSession, grid.querySelector(`[data-session-id="${id}"] .card-open`));
    saveAndNotify("모임을 만들었어요. 링크를 복사해 친구에게 보내 보세요.");
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
      notify("공유 링크를 복사했어요.");
    } catch {
      window.prompt("이 모임 링크를 복사하세요.", url);
    }
  }

  function openSharedSession() {
    if (!location.hash.startsWith("#session=")) return;
    if (location.hash.length > MAX_LINK_LENGTH) {
      notify("유효한 모임 링크가 아니에요. 받은 링크를 확인해 주세요.");
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
      notify("유효한 모임 링크가 아니에요. 받은 링크를 확인해 주세요.");
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
    const subject = session.demo ? `[예시] ${session.title}` : session.title;
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyKaki//Study Sessions//EN",
      "BEGIN:VEVENT", `UID:${session.demo ? `${session.id}-${session.date}` : session.id}@studykaki.local`,
      `DTSTAMP:${calendarDate(new Date())}`,
      `DTSTART:${calendarDate(start)}`, `DTEND:${calendarDate(end)}`,
      `SUMMARY:${calendarText(subject)}`, `LOCATION:${calendarText(canonicalVenue(session.venue))}`,
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
    notify("캘린더 파일을 다운로드했어요.");
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
      label.textContent = savedState.profile.nickname || savedState.profile.name || "내 프로필";
    }
  }

  function saveProfile(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(profileForm));
    const profile = profileFromData({ ...data, school: data.school ?? data.course });
    for (const field of ["name", "school", "year"]) {
      const control = profileControl(field);
      if (control?.required && !profile[field]) {
        control.setCustomValidity("이 항목을 입력해 주세요.");
        control.addEventListener("input", () => control.setCustomValidity(""), { once: true });
        control.reportValidity();
        return;
      }
    }
    savedState.profile = profile;
    saveAndNotify("이 브라우저에 프로필을 저장했어요.");
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
    saveAndNotify("이 브라우저에서 프로필을 삭제했어요.");
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
