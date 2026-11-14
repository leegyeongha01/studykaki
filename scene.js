(() => {
  "use strict";

  const clock = document.querySelector("#scene-time");
  const date = document.querySelector("#scene-date");
  const character = document.querySelector("#scene-character");
  const peerLayer = document.querySelector("#scene-peers");
  const seatGrid = document.querySelector("#room-chair-grid");
  const roomLabel = document.querySelector("#scene-location-name");
  const locationState = document.querySelector("#scene-location-status");
  const seatButtons = [...document.querySelectorAll("[data-seat].scene-seat")];
  const zone = "Asia/Singapore";
  const timeFormat = new Intl.DateTimeFormat("ko-KR", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const dateFormat = new Intl.DateTimeFormat("ko-KR", {
    timeZone: zone, weekday: "short", day: "numeric", month: "short",
  });
  const names = { quiet: "조용한 열람실", module: "과목 스터디룸", break: "휴게실" };

  if (location.hash.startsWith("#session=")) {
    location.replace(new URL(`./campus.html${location.hash}`, location.href));
    return;
  }

  function showTime() {
    const now = new Date();
    clock.textContent = timeFormat.format(now);
    clock.dateTime = now.toISOString();
    date.textContent = dateFormat.format(now);
  }

  function updateLocation() {
    const { sceneRoom, roomPhase } = document.body.dataset;
    roomLabel.textContent = names[sceneRoom] || names.quiet;
    if (roomPhase !== "active") {
      delete character.dataset.seat;
      seatButtons.forEach(button => button.setAttribute("aria-pressed", "false"));
      peerLayer.replaceChildren();
    }
    const seat = seatButtons.find(button => button.dataset.seat === character.dataset.seat);
    locationState.textContent = roomPhase === "active" ? seat?.textContent.trim() || "방에 입장했어요" : "입구";
  }

  function showPeers() {
    if (document.body.dataset.roomPhase !== "active") return;
    const previews = [...seatGrid.querySelectorAll(".is-peer")].slice(0, 5).map(seat => {
      const peer = character.cloneNode(true);
      peer.removeAttribute("id");
      delete peer.dataset.seat;
      peer.classList.add("scene-peer");
      const avatar = peer.querySelector(".kaki-avatar");
      const name = peer.querySelector(".scene-name");
      avatar.removeAttribute("id");
      name.removeAttribute("id");
      name.textContent = seat.querySelector(".room-seat-name").textContent;
      const look = seat.querySelector(".room-seat-avatar").dataset;
      Object.assign(avatar.dataset, look);
      return peer;
    });
    peerLayer.replaceChildren(...previews);
  }

  const observer = new MutationObserver(updateLocation);
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-room-phase", "data-scene-room"] });
  new MutationObserver(showPeers).observe(seatGrid, { childList: true });
  seatButtons.forEach(button => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      character.dataset.seat = button.dataset.seat;
      seatButtons.forEach(other => other.setAttribute("aria-pressed", String(other === button)));
      updateLocation();
    });
  });
  showTime();
  updateLocation();
  setInterval(showTime, 1000);
})();
