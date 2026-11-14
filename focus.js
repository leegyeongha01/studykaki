(() => {
  'use strict';

  const dialog = document.querySelector('#focus-dialog');
  if (!dialog) return;

  const display = dialog.querySelector('#timer-display');
  const toggle = dialog.querySelector('#timer-toggle');
  const reset = dialog.querySelector('#timer-reset');
  const status = dialog.querySelector('#timer-status');
  const summary = dialog.querySelector('#focus-summary');
  const goal = dialog.querySelector('#focus-goal');
  const modes = dialog.querySelectorAll('[data-timer-mode]');
  const presets = dialog.querySelectorAll('[data-focus-minutes]');
  const taskForm = dialog.querySelector('#focus-task-form');
  const taskInput = dialog.querySelector('#focus-task-input');
  const taskList = dialog.querySelector('#focus-task-list');

  const storageKey = 'studykaki.focus.v1';
  const allowedMinutes = [25, 50, 75];
  const maxTasks = 20;
  const maxTaskLength = 100;
  const minute = 60_000;
  const day = 24 * 60 * minute;
  const singaporeDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  let storageAvailable = true;

  function defaultState() {
    return {
      mode: 'focus', minutes: 25, remaining: 25 * minute, endsAt: null,
      goal: '', history: {}, tasks: [],
    };
  }

  function readState() {
    if (!storageAvailable) return state;

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (!stored || typeof stored !== 'object') return defaultState();

      const mode = stored.mode === 'break' ? 'break' : 'focus';
      const minutes = allowedMinutes.includes(stored.minutes) ? stored.minutes : 25;
      const maximum = (mode === 'focus' ? minutes : 5) * minute;
      const history = Object.fromEntries(Object.entries(stored.history || {}).filter(
        ([date, amount]) => /^\d{4}-\d{2}-\d{2}$/.test(date)
          && Number.isSafeInteger(amount) && amount > 0,
      ));
      const tasks = Array.isArray(stored.tasks) ? stored.tasks.filter(
        task => task && typeof task.label === 'string' && task.label.trim(),
      ).slice(0, maxTasks).map(task => ({
        label: task.label.trim().slice(0, maxTaskLength),
        done: task.done === true,
      })) : [];

      return {
        mode,
        minutes,
        remaining: Number.isFinite(stored.remaining)
          ? Math.min(maximum, Math.max(0, stored.remaining)) : maximum,
        endsAt: Number.isSafeInteger(stored.endsAt) && stored.endsAt > 0
          && stored.endsAt <= Date.now() + maximum ? stored.endsAt : null,
        goal: typeof stored.goal === 'string' ? stored.goal.slice(0, 160) : '',
        history,
        tasks,
      };
    } catch (error) {
      if (error instanceof SyntaxError) return defaultState();
      storageAvailable = false;
      return defaultState();
    }
  }

  let state = readState();

  function saveState() {
    if (!storageAvailable) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      storageAvailable = false;
    }
  }

  function localDate(timestamp) {
    const parts = Object.fromEntries(singaporeDate.formatToParts(timestamp).map(
      ({ type, value }) => [type, value],
    ));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function renderSummary() {
    const now = Date.now();
    const today = state.history[localDate(now)] || 0;
    let streak = 0;
    let timestamp = today ? now : now - day;
    while (state.history[localDate(timestamp)]) {
      streak += 1;
      timestamp -= day;
    }
    summary.textContent = `오늘 ${today}분 집중 · ${streak}일 연속`;
  }

  function duration() {
    return (state.mode === 'focus' ? state.minutes : 5) * minute;
  }

  function finishIfDue() {
    if (state.endsAt === null || state.endsAt > Date.now()) return;

    // Another tab may already have recorded this timer's completion.
    state = readState();
    if (state.endsAt === null || state.endsAt > Date.now()) return;

    if (state.mode === 'focus') {
      const date = localDate(state.endsAt);
      state.history[date] = (state.history[date] || 0) + state.minutes;
    }
    state.endsAt = null;
    state.remaining = 0;
    saveState();
    status.textContent = state.mode === 'focus'
      ? '집중 시간이 끝났어요. 오늘 집중 기록에 추가했어요.' : '휴식 시간이 끝났어요.';
    renderSummary();
  }

  function renderTimer() {
    finishIfDue();

    const remaining = state.endsAt === null ? state.remaining : state.endsAt - Date.now();
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    const clock = [Math.floor(seconds / 60), seconds % 60]
      .map(value => String(value).padStart(2, '0')).join(':');
    if (display.textContent !== clock) display.textContent = clock;

    const label = state.endsAt !== null ? '일시정지'
      : state.remaining > 0 && state.remaining < duration() ? '이어서 시작' : '시작';
    if (toggle.textContent !== label) toggle.textContent = label;
  }

  function renderSettings() {
    for (const button of modes) {
      button.setAttribute('aria-pressed', String(button.dataset.timerMode === state.mode));
    }
    for (const button of presets) {
      const selected = Number(button.dataset.focusMinutes) === state.minutes;
      button.setAttribute('aria-pressed', String(selected && state.mode === 'focus'));
    }
    if (goal.value !== state.goal) goal.value = state.goal;
    renderTimer();
    renderSummary();
    renderTasks();
  }

  function renderTasks() {
    if (!taskList) return;

    const rows = state.tasks.map((task, index) => {
      const item = document.createElement('li');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      const title = document.createElement('span');
      const remove = document.createElement('button');

      checkbox.type = 'checkbox';
      checkbox.checked = task.done;
      checkbox.dataset.taskIndex = index;
      title.textContent = task.label;
      label.append(checkbox, title);

      remove.type = 'button';
      remove.dataset.removeTask = index;
      remove.textContent = '×';
      remove.setAttribute('aria-label', `할 일 삭제 (${task.label})`);
      item.append(label, remove);
      return item;
    });

    taskList.replaceChildren(...rows);
  }

  function reloadState() {
    state = readState();
    finishIfDue();
  }

  function setTimer(mode, minutes = state.minutes) {
    state.mode = mode;
    state.minutes = minutes;
    state.remaining = duration();
    state.endsAt = null;
    status.textContent = '';
    saveState();
    renderSettings();
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-open-focus]') || dialog.open) return;
    reloadState();
    renderSettings();
    dialog.showModal();
  });

  toggle.addEventListener('click', () => {
    reloadState();
    if (state.endsAt === null) {
      if (state.remaining === 0) state.remaining = duration();
      state.endsAt = Date.now() + state.remaining;
      status.textContent = state.mode === 'focus' ? '집중 시간이 시작됐어요.' : '휴식 시간이 시작됐어요.';
    } else {
      state.remaining = Math.max(0, state.endsAt - Date.now());
      state.endsAt = null;
      status.textContent = '타이머를 일시정지했어요.';
    }
    saveState();
    renderTimer();
  });

  reset.addEventListener('click', () => {
    reloadState();
    setTimer(state.mode);
  });

  for (const button of modes) {
    button.addEventListener('click', () => {
      reloadState();
      if (button.dataset.timerMode !== state.mode) setTimer(button.dataset.timerMode);
    });
  }

  for (const button of presets) {
    button.addEventListener('click', () => {
      reloadState();
      const minutes = Number(button.dataset.focusMinutes);
      if (state.mode !== 'focus' || minutes !== state.minutes) setTimer('focus', minutes);
    });
  }

  goal.addEventListener('input', () => {
    const value = goal.value.slice(0, 160);
    reloadState();
    state.goal = value;
    saveState();
  });

  taskForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    reloadState();
    const label = taskInput.value.trim().slice(0, maxTaskLength);
    if (!label) return;
    if (state.tasks.length >= maxTasks) {
      status.textContent = '할 일은 최대 20개까지 추가할 수 있어요.';
      return;
    }

    state.tasks.push({ label, done: false });
    saveState();
    taskInput.value = '';
    taskInput.focus();
    renderTasks();
    status.textContent = '할 일을 추가했어요.';
  });

  taskList?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-task-index]');
    if (!checkbox) return;
    reloadState();
    const task = state.tasks[Number(checkbox.dataset.taskIndex)];
    if (!task) return;

    task.done = checkbox.checked;
    saveState();
    status.textContent = task.done ? '할 일을 완료했어요.' : '완료 표시를 해제했어요.';
  });

  taskList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-task]');
    if (!button) return;
    reloadState();
    const index = Number(button.dataset.removeTask);
    state.tasks.splice(index, 1);
    saveState();
    renderTasks();
    status.textContent = '할 일을 삭제했어요.';
    const nextButton = taskList.querySelector(`[data-remove-task="${index}"]`)
      || taskList.querySelector(`[data-remove-task="${index - 1}"]`);
    (nextButton || taskInput).focus();
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    reloadState();
    status.textContent = '';
    renderSettings();
  });

  renderSettings();
  window.setInterval(() => {
    if (dialog.open || state.endsAt !== null) renderTimer();
  }, 250);
})();
