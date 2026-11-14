(() => {
  "use strict";

  const clock = document.querySelector("#scene-time");
  const date = document.querySelector("#scene-date");
  const character = document.querySelector("#scene-character");
  const roomLabel = document.querySelector("#scene-location-name");
  const locationState = document.querySelector("#scene-location-status");
  const seatButtons = [...document.querySelectorAll("[data-seat].scene-seat")];
  const zone = "Asia/Singapore";
  const timeFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const dateFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, weekday: "short", day: "numeric", month: "short",
  });
  const names = { quiet: "Quiet reading room", module: "Module study room", break: "Break room" };

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
    }
    const seat = seatButtons.find(button => button.dataset.seat === character.dataset.seat);
    locationState.textContent = roomPhase === "active" ? seat?.textContent.trim() || "Inside the room" : "At the entrance";
  }

  const observer = new MutationObserver(updateLocation);
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-room-phase", "data-scene-room"] });
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
