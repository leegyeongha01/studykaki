(() => {
  "use strict";

  const dialog = document.querySelector("#room-dialog");
  if (!dialog) return;

  const form = dialog.querySelector("#room-form");
  const entry = dialog.querySelector("#room-entry");
  const space = dialog.querySelector("#room-space");
  const title = dialog.querySelector("#room-name");
  const chairGrid = dialog.querySelector("#room-chair-grid");
  const status = dialog.querySelector("#room-state");
  const goal = dialog.querySelector("#room-goal");
  const goalTitle = dialog.querySelector("#room-goal-title");
  const goalForm = dialog.querySelector("#room-goal-form");
  const avatarPreview = document.querySelector("#room-avatar-preview");
  const sceneAvatar = document.querySelector("#scene-avatar");
  const sceneAvatarName = document.querySelector("#scene-avatar-name");
  const profileStep = dialog.querySelector("#room-profile-step");
  const choiceStep = dialog.querySelector("#room-choice-step");
  const modal = typeof dialog.showModal === "function";
  const shareButton = dialog.querySelector("#room-share");
  const connectButton = dialog.querySelector("#room-connect");
  const connectNote = dialog.querySelector("#room-connect-note");
  const inviteNotice = dialog.querySelector("#room-invite-notice");
  const error = dialog.querySelector("#room-error");
  const rooms = {
    quiet: "조용한 열람실",
    module: "과목 스터디룸",
    break: "휴게실",
  };
  const avatars = new Set(["terracotta", "sage", "indigo", "gold", "navy", "coral", "mint", "charcoal"]);
  const hairColors = new Set(["dark", "brown", "blond", "rose", "slate", "auburn", "silver", "blue"]);
  const hairStyles = new Set(["short", "bob", "bun", "pony", "curls", "shaved"]);
  const skinTones = new Set(["light", "medium", "tan", "deep"]);
  const accessories = new Set(["none", "cap", "earrings", "glasses"]);
  const storageKey = "studykaki-room-v1";
  const seatCount = 8;
  const codes = /^[a-f0-9]{16}$/;
  const identityIds = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  let invite = null;
  let room = null;
  let identity = null;
  let transportStatus = "idle";
  let transportMessage = "";
  let connection = null;
  let remotePeers = [];
  let latestPosition;
  let rosterKey = "";
  let connectionRevision = 0;
  let feedbackTimer;
  let phase = "profile";

  function createId(bytes) {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function cleanText(value, maxLength) {
    if (typeof value !== "string") return "";
    return Array.from(value.replace(/[\x00-\x1F\x7F]/g, "").trim()).slice(0, maxLength).join("");
  }

  function displayName(value) {
    return cleanText(value, 28);
  }

  function readIdentity(data) {
    if (!data || typeof data.id !== "string" || !identityIds.test(data.id) || !avatars.has(data.avatar)) return null;
    const name = displayName(data.name);
    if (!name) return null;
    const position = data.position;
    const safePosition = position && Number.isFinite(position.x) && Number.isFinite(position.z) &&
      Math.abs(position.x) <= 11 && Math.abs(position.z) <= 8 && Number.isFinite(position.facing) ? {
        x: position.x, z: position.z, facing: position.facing,
        walking: position.walking === true, sitting: position.sitting === true,
      } : undefined;
    return {
      id: data.id, name, avatar: data.avatar, hair: chosenHair(data.hair),
      hairStyle: hairStyles.has(data.hairStyle) ? data.hairStyle : "short",
      skin: skinTones.has(data.skin) ? data.skin : "medium",
      accessory: accessories.has(data.accessory) ? data.accessory : "none",
      glasses: data.glasses === true, headphones: data.headphones === true, position: safePosition,
    };
  }

  function readPreference() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  }

  function writePreference(data) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // The study room still works when browser storage is unavailable.
    }
  }

  function chosenRoom(value) {
    return typeof value === "string" && Object.hasOwn(rooms, value) ? value : "quiet";
  }

  function chosenHair(value) {
    return hairColors.has(value) ? value : "dark";
  }

  function field(name) {
    return form.elements.namedItem(name);
  }

  function chosenStyle() {
    const value = (field("hair-style") || field("hairStyle") || field("style"))?.value;
    return hairStyles.has(value) ? value : "short";
  }

  function appearance() {
    const skin = field("skin")?.value;
    const accessory = field("accessory")?.value;
    return {
      avatar: avatars.has(field("avatar").value) ? field("avatar").value : "terracotta",
      hair: chosenHair(field("hair")?.value),
      hairStyle: chosenStyle(),
      skin: skinTones.has(skin) ? skin : "medium",
      accessory: accessories.has(accessory) ? accessory : "none",
      glasses: Boolean(field("glasses")?.checked),
      headphones: Boolean(field("headphones")?.checked),
    };
  }

  function paintCharacter(node, look) {
    const { avatar, hair, hairStyle, skin, accessory, glasses, headphones } = look;
    Object.assign(node.dataset, {
      avatar, hair, hairStyle, skin, accessory,
      glasses: String(glasses), headphones: String(headphones),
    });
  }

  function sceneKind() {
    document.body.dataset.sceneRoom = chosenRoom(field("room").value);
  }

  function previewAvatar() {
    const look = appearance();
    for (const avatar of [avatarPreview, sceneAvatar]) {
      if (!avatar) continue;
      paintCharacter(avatar, look);
    }
    if (sceneAvatarName) {
      sceneAvatarName.textContent = displayName(field("name").value) || "스터디 친구";
    }
  }

  function setPhase(value) {
    phase = value;
    document.body.dataset.roomPhase = value;
    if (profileStep) profileStep.hidden = value !== "profile";
    if (choiceStep) choiceStep.hidden = value !== "choice";
    entry.hidden = value === "active";
    space.hidden = value !== "active";
    sceneKind();
  }

  function profileComplete() {
    if (!profileStep) return true;
    for (const name of ["name", "school", "year"]) {
      const control = field(name);
      if (control?.required && (!control.value.trim() || !control.checkValidity())) {
        control.setCustomValidity(control.value.trim() ? "" : "이 항목을 입력해 주세요.");
        control.reportValidity();
        return false;
      }
    }
    return true;
  }

  function showRoomChoice() {
    if (!profileComplete()) return;
    setPhase("choice");
    field("room").focus();
  }

  function adapter() {
    return window.StudyKakiRoomsTransport?.connect;
  }

  function seatNode(person, isYou) {
    const seat = document.createElement(chairGrid.tagName === "UL" ? "li" : "div");
    seat.className = `room-seat ${!person ? "is-open" : isYou ? "is-you" : "is-peer"}`;
    const character = document.createElement("span");
    character.className = "room-seat-avatar";
    character.setAttribute("aria-hidden", "true");
    if (person) paintCharacter(character, person);
    const name = document.createElement("span");
    name.className = "room-seat-name";
    name.textContent = person?.name || "빈자리";
    const caption = document.createElement("small");
    caption.className = "room-seat-status";
    caption.textContent = !person ? "이용 가능" : isYou ? "나" : "접속 중";
    seat.append(character, name, caption);
    return seat;
  }

  function renderRoom() {
    if (!identity) return;
    const people = [identity, ...remotePeers];
    chairGrid.replaceChildren(...Array.from({ length: Math.max(seatCount, people.length) },
      (_, index) => seatNode(people[index], index === 0)));

    if (transportStatus === "connecting") status.textContent = "온라인 방에 연결 중…";
    else if (transportStatus === "ready") status.textContent = "연결됐어요. 친구를 기다리는 중이에요.";
    else if (transportStatus === "live") {
      const others = remotePeers.length;
      status.textContent = others ? `${others}명과 함께 공부 중` :
        "연결됐어요. 친구를 기다리는 중이에요.";
    } else status.textContent = "혼자 공부 중";

    if (connectButton) {
      connectButton.hidden = !adapter() || transportStatus === "ready" || transportStatus === "live";
      connectButton.disabled = transportStatus === "connecting";
      connectButton.textContent = transportStatus === "connecting" ? "연결 중…" :
        transportStatus === "failed" ? "다시 연결" : room.invited ? "온라인 방 참여" : "온라인 연결";
    }
    if (shareButton) shareButton.textContent = transportStatus === "ready" || transportStatus === "live" ?
      "초대 링크 복사" : "방 링크 복사";
    if (connectNote) {
      const messages = {
        idle: adapter() ? "온라인에 연결하면 친구를 초대할 수 있어요. 참여자에게는 이름과 아바타가 보여요." :
          "이 방은 개인 공부방이에요. 링크를 열면 각자의 브라우저에서 같은 유형의 방을 열 수 있어요.",
        connecting: "온라인 방에 연결하는 중에도 공부를 이어갈 수 있어요.",
        ready: "초대 링크를 복사해 친구에게 보내세요. 친구가 참여할 때까지 이 탭을 열어 두세요.",
        live: "함께 공부하는 동안 이 탭을 열어 두세요.",
        failed: "온라인 연결이 끊겼어요. 여기서 계속 공부하거나 다시 연결할 수 있어요.",
      };
      connectNote.textContent = transportMessage || messages[transportStatus];
    }
  }

  function leaveRoom() {
    remotePeers = [];
    const shareFallback = dialog.querySelector("#room-copy-fallback");
    if (shareFallback) shareFallback.hidden = true;
    latestPosition = undefined;
    rosterKey = "";
    connectionRevision += 1;
    connection?.close();
    connection = null;
    transportStatus = "idle";
    transportMessage = "";
    identity = null;
    room = null;
    setPhase("profile");
  }

  async function connectRoom() {
    const connect = adapter();
    if (!connect || !room || !identity || ["connecting", "ready", "live"].includes(transportStatus)) return;
    const revision = ++connectionRevision;
    connection?.close();
    connection = null;
    transportStatus = "connecting";
    transportMessage = "";
    renderRoom();
    try {
      const link = await connect({
        room: { ...room },
        identity: { ...identity, position: latestPosition },
        onPeers(list) {
          if (revision !== connectionRevision) return;
          const roster = new Map();
          if (Array.isArray(list)) {
            for (const item of list.slice(0, 24)) {
              const peer = readIdentity(item);
              if (peer && peer.id !== identity.id) roster.set(peer.id, peer);
            }
          }
          remotePeers = Array.from(roster.values());
          window.dispatchEvent(new CustomEvent("studykaki:room-peers", { detail: remotePeers }));
          const nextRoster = JSON.stringify(remotePeers.map(({ position, ...profile }) => profile));
          if (nextRoster !== rosterKey) {
            rosterKey = nextRoster;
            renderRoom();
          }
        },
        onStatus(nextStatus, message) {
          if (revision !== connectionRevision) return;
          transportStatus = ["live", "ready", "connecting"].includes(nextStatus) ? nextStatus : "failed";
          transportMessage = typeof message === "string" ? message.slice(0, 180) : "";
          if (transportStatus === "failed") {
            remotePeers = [];
            rosterKey = "";
            window.dispatchEvent(new CustomEvent("studykaki:room-peers", { detail: [] }));
          }
          renderRoom();
        },
      });
      if (revision === connectionRevision) connection = link;
      else link?.close();
    } catch {
      if (revision !== connectionRevision) return;
      transportStatus = "failed";
      remotePeers = [];
      renderRoom();
    }
  }

  function openRoom(selection) {
    if (modal && dialog.open && !selection) return;
    if (identity) leaveRoom();
    const preference = readPreference();
    invite = selection || null;
    field("room").value = chosenRoom(invite?.kind || preference.kind);
    field("avatar").value = avatars.has(preference.avatar) ? preference.avatar : "terracotta";
    field("name").value = displayName(preference.name);
    if (field("school")) field("school").value = typeof preference.school === "string" ? preference.school : "";
    if (field("year")) field("year").value = typeof preference.year === "string" ? preference.year : "";
    if (field("hair")) field("hair").value = chosenHair(preference.hair);
    if (field("skin")) field("skin").value = skinTones.has(preference.skin) ? preference.skin : "medium";
    if (field("accessory")) field("accessory").value = accessories.has(preference.accessory) ? preference.accessory : "none";
    for (const name of ["glasses", "headphones"]) {
      if (field(name)) field(name).checked = preference[name] === true;
    }
    const hairStyle = field("hair-style") || field("hairStyle") || field("style");
    if (hairStyle) hairStyle.value = hairStyles.has(preference.hairStyle) ? preference.hairStyle : "short";
    previewAvatar();
    const remember = field("remember");
    if (remember) remember.checked = Boolean(preference.name);
    if (inviteNotice) {
      inviteNotice.hidden = !invite?.invited;
      if (invite?.invited) inviteNotice.textContent = "온라인 방에 초대됐어요. 방에 들어간 다음 ‘온라인 방 참여’를 누르세요.";
    }
    if (error) error.hidden = true;
    setPhase("profile");
    if (modal && !dialog.open) dialog.showModal();
  }

  function enterRoom(event) {
    event.preventDefault();
    if (profileStep && phase === "profile") {
      showRoomChoice();
      return;
    }
    const fields = new FormData(form);
    const kind = chosenRoom(fields.get("room"));
    const name = displayName(fields.get("name")) || "스터디 친구";
    const look = appearance();
    const matchesInvite = invite?.kind === kind;
    room = { kind, code: matchesInvite && invite.code ? invite.code : createId(8),
      invited: Boolean(matchesInvite && invite.invited) };
    identity = { id: createId(12), name, ...look };
    const preference = readPreference();
    writePreference({
      ...preference, ...look, kind, name: profileStep || fields.get("remember") ? name : undefined,
      school: cleanText(fields.get("school"), 80),
      year: cleanText(fields.get("year"), 28),
    });
    headingText(rooms[kind]);
    const savedGoal = typeof preference.goal === "string" ? preference.goal.slice(0, 120) : "";
    if (goal) goal.value = savedGoal;
    renderGoal(savedGoal);
    setPhase("active");
    renderRoom();
    title.focus();
  }

  function headingText(value) {
    title.textContent = value;
    title.tabIndex = -1;
  }

  function parseInvite() {
    if (!location.hash.startsWith("#room=") || location.hash.length > 300) return null;
    const fields = new URLSearchParams(location.hash.slice(1));
    const kind = fields.get("room");
    const code = fields.get("invite");
    if (!Object.hasOwn(rooms, kind) || (code !== null && !codes.test(code))) return null;
    const transportRoom = window.StudyKakiRoomsTransport?.invitedRoom?.();
    return { kind, code, invited: transportRoom === kind };
  }

  function showInviteIfPresent() {
    const fromLink = parseInvite();
    if (fromLink) openRoom(fromLink);
  }

  async function shareRoom() {
    if (!room) return;
    const url = new URL(location.href);
    url.hash = new URLSearchParams({ room: room.kind, invite: room.code }).toString();
    const roomLink = connection?.shareUrl?.() || url.href;
    const fallback = dialog.querySelector("#room-copy-fallback");
    try {
      await navigator.clipboard.writeText(roomLink);
      if (fallback) fallback.hidden = true;
      clearTimeout(feedbackTimer);
      if (status) {
        const previousStatus = status.textContent;
        status.textContent = "방 링크를 복사했어요.";
        feedbackTimer = setTimeout(() => {
          if (status.textContent === "방 링크를 복사했어요.") status.textContent = previousStatus;
        }, 3_000);
      }
    } catch {
      const field = dialog.querySelector("#room-copy-url");
      if (!fallback || !field) return;
      field.value = roomLink;
      fallback.hidden = false;
      field.focus();
      field.select();
    }
  }

  function renderGoal(value) {
    if (!goalTitle) return;
    goalTitle.textContent = value ? `내 공부 목표 · ${value}` : "";
    goalTitle.hidden = !value;
  }

  for (const trigger of document.querySelectorAll("[data-open-room]")) {
    trigger.addEventListener("click", () => {
      const kind = trigger.dataset.openRoom;
      openRoom(kind ? { kind: chosenRoom(kind), code: null } : null);
    });
  }
  form.addEventListener("input", (event) => {
    event.target.setCustomValidity?.("");
    previewAvatar();
    sceneKind();
  });
  form.addEventListener("change", () => {
    previewAvatar();
    sceneKind();
  });
  dialog.querySelector("[data-room-next]")?.addEventListener("click", showRoomChoice);
  dialog.querySelector("[data-room-back]")?.addEventListener("click", () => {
    setPhase("profile");
    field("name").focus();
  });
  dialog.querySelectorAll("[data-room-reset]").forEach((control) => {
    control.addEventListener("click", () => {
      leaveRoom();
      field("name").focus();
    });
  });
  form.addEventListener("submit", enterRoom);
  dialog.querySelector("#room-exit")?.addEventListener("click", () => {
    if (modal) dialog.close();
    else {
      leaveRoom();
      field("name").focus();
    }
  });
  dialog.addEventListener("close", () => {
    clearTimeout(feedbackTimer);
    leaveRoom();
  });
  shareButton?.addEventListener("click", shareRoom);
  connectButton?.addEventListener("click", connectRoom);
  goalForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = goal.value.trim().slice(0, 120);
    writePreference({ ...readPreference(), goal: value });
    if (goalTitle) renderGoal(value);
    else if (value) {
      const previousStatus = status.textContent;
      status.textContent = "이 브라우저에 공부 목표를 저장했어요.";
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        if (status.textContent === "이 브라우저에 공부 목표를 저장했어요.") status.textContent = previousStatus;
      }, 3_000);
    }
  });
  window.addEventListener("hashchange", showInviteIfPresent);
  window.addEventListener("studykaki:position", (event) => {
    latestPosition = event.detail;
    connection?.update({ position: latestPosition });
  });
  window.addEventListener("pagehide", () => {
    if (identity) leaveRoom();
  });
  if (!modal) openRoom(parseInvite());
  else showInviteIfPresent();
})();
