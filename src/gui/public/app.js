/* global document, window, fetch, localStorage, matchMedia */

const ROLE_META = {
  analyst: ['Analyse', 'read-only'],
  planner: ['Planung', 'read-only'],
  implementer: ['Umsetzung', 'workspace-write'],
  reviewer: ['Review', 'read-only'],
  fixer: ['Korrektur', 'workspace-write'],
  final_judge: ['Finale Prüfung', 'read-only'],
};

const state = { csrfToken: '', polling: null };
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  renderRoleSkeletons();
  $('run-form').addEventListener('submit', startRun);
  $('cancel-button').addEventListener('click', cancelRun);
  $('task').addEventListener('input', updateTaskCount);
  $('close-report').addEventListener('click', () => $('report-dialog').close());
  void bootstrap();
});

async function bootstrap() {
  try {
    const data = await api('/api/bootstrap');
    state.csrfToken = data.csrfToken;
    $('root-path').textContent = data.root;
    fillConfig(data.config);
    renderDoctor(data.doctor);
    renderReports(data.reports);
    setConnection('online', 'Lokal verbunden');
    const snapshot = await api('/api/run');
    renderRun(snapshot);
    if (snapshot.status === 'running') startPolling();
  } catch (error) {
    setConnection('error', 'Verbindung fehlgeschlagen');
    showError(messageOf(error));
  }
}

function renderRoleSkeletons() {
  const grid = $('roles-grid');
  grid.replaceChildren();
  for (const [role, [label, permission]] of Object.entries(ROLE_META)) {
    const card = document.createElement('article');
    card.className = 'role-card';
    const header = document.createElement('div');
    header.className = 'role-card-header';
    const title = document.createElement('h3');
    title.textContent = label;
    const access = document.createElement('span');
    access.className = 'permission';
    access.textContent = permission;
    header.append(title, access);

    const controls = document.createElement('div');
    controls.className = 'role-controls';
    controls.append(
      labeledSelect(`role-${role}-provider`, 'Provider', ['claude', 'codex']),
      labeledInput(`role-${role}-model`, 'Modell', 'default'),
    );
    card.append(header, controls);
    grid.append(card);
  }
}

function labeledSelect(id, text, values) {
  const label = document.createElement('label');
  label.htmlFor = id;
  label.append(document.createTextNode(text));
  const select = document.createElement('select');
  select.id = id;
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'claude' ? 'Claude Code' : 'Codex CLI';
    select.append(option);
  }
  label.append(select);
  return label;
}

function labeledInput(id, text, value) {
  const label = document.createElement('label');
  label.htmlFor = id;
  label.append(document.createTextNode(text));
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.maxLength = 100;
  input.value = value;
  input.spellcheck = false;
  label.append(input);
  return label;
}

function fillConfig(config) {
  $('max-cycles').value = String(config.workflow.max_cycles);
  $('max-runtime').value = String(config.workflow.max_runtime_minutes);
  $('stop-no-progress').checked = config.workflow.stop_on_no_progress;
  $('require-tests').checked = config.quality_gates.require_tests_pass;
  $('require-review').checked = config.quality_gates.require_clean_review;
  for (const input of document.querySelectorAll('input[name="severity"]')) {
    input.checked = config.quality_gates.block_severities.includes(input.value);
  }
  for (const role of Object.keys(ROLE_META)) {
    $(`role-${role}-provider`).value =
      config.roles[role].provider === 'claude' ? 'claude' : 'codex';
    $(`role-${role}-model`).value = config.roles[role].model;
  }
  for (const name of ['build', 'test', 'lint', 'typecheck']) {
    $(`command-${name}`).value = config.commands[name] || '';
  }
}

function collectRequest() {
  const roles = {};
  for (const role of Object.keys(ROLE_META)) {
    roles[role] = {
      provider: $(`role-${role}-provider`).value,
      model: $(`role-${role}-model`).value.trim(),
    };
  }
  return {
    task: $('task').value.trim(),
    dryRun: $('dry-run').checked,
    workflow: {
      maxCycles: Number($('max-cycles').value),
      maxRuntimeMinutes: Number($('max-runtime').value),
      stopOnNoProgress: $('stop-no-progress').checked,
    },
    roles,
    qualityGates: {
      requireTestsPass: $('require-tests').checked,
      requireCleanReview: $('require-review').checked,
      blockSeverities: [...document.querySelectorAll('input[name="severity"]:checked')].map(
        (item) => item.value,
      ),
    },
    commands: Object.fromEntries(
      ['build', 'test', 'lint', 'typecheck'].map((name) => [
        name,
        $(`command-${name}`).value.trim(),
      ]),
    ),
  };
}

async function startRun(event) {
  event.preventDefault();
  showError('');
  const request = collectRequest();
  if (!request.task) return showError('Bitte beschreibe zuerst eine Aufgabe.');
  if (!request.qualityGates.blockSeverities.length)
    return showError('Wähle mindestens einen blockierenden Schweregrad.');
  setRunningControls(true);
  try {
    const snapshot = await api('/api/run', { method: 'POST', body: request });
    renderRun(snapshot);
    startPolling();
  } catch (error) {
    setRunningControls(false);
    showError(messageOf(error));
  }
}

async function cancelRun() {
  try {
    const snapshot = await api('/api/cancel', { method: 'POST', body: {} });
    renderRun(snapshot);
    stopPolling();
  } catch (error) {
    showError(messageOf(error));
  }
}

function startPolling() {
  stopPolling();
  state.polling = window.setInterval(async () => {
    try {
      const snapshot = await api('/api/run');
      renderRun(snapshot);
      if (snapshot.status !== 'running') stopPolling();
    } catch (error) {
      stopPolling();
      showError(messageOf(error));
    }
  }, 800);
}

function stopPolling() {
  if (state.polling !== null) window.clearInterval(state.polling);
  state.polling = null;
}

function renderRun(snapshot) {
  const labels = {
    idle: 'Bereit',
    running: 'Läuft',
    completed: 'Fertig',
    failed: 'Fehler',
    cancelled: 'Abgebrochen',
  };
  const badge = $('run-status');
  badge.textContent = labels[snapshot.status] || snapshot.status;
  badge.className = `badge ${snapshot.status}`;
  setRunningControls(snapshot.status === 'running');

  const summary = $('run-summary');
  summary.replaceChildren();
  if (!snapshot.id && !snapshot.result) {
    summary.className = 'empty-state';
    summary.textContent = 'Noch kein Lauf gestartet.';
  } else {
    summary.className = 'run-result';
    const title = document.createElement('strong');
    title.textContent = snapshot.result?.report?.task || `Run ${snapshot.id?.slice(0, 8) || ''}`;
    const detail = document.createElement('span');
    detail.textContent = snapshot.error || resultDetail(snapshot);
    summary.append(title, detail);
  }
  const log = $('event-log');
  log.replaceChildren();
  for (const event of snapshot.events || []) {
    const item = document.createElement('li');
    item.textContent = event;
    log.append(item);
  }
}

function resultDetail(snapshot) {
  if (snapshot.status === 'running') return 'Agenten arbeiten kontrolliert an der Aufgabe.';
  if (snapshot.result?.dryRun) return 'Dry Run abgeschlossen – es wurden keine Dateien verändert.';
  const report = snapshot.result?.report;
  return report
    ? `${report.status} · ${report.diff.filesChanged} Datei(en) geändert`
    : 'Lauf beendet.';
}

function renderDoctor(checks) {
  const list = $('doctor-list');
  list.replaceChildren();
  for (const check of checks) {
    const item = document.createElement('li');
    const indicator = document.createElement('span');
    indicator.className = `check-indicator ${check.status}`;
    const label = document.createElement('span');
    label.className = 'check-label';
    label.textContent = check.label;
    const detail = document.createElement('span');
    detail.className = 'check-detail';
    detail.textContent = check.detail;
    item.append(indicator, label, detail);
    list.append(item);
  }
  const passes = checks.filter((check) => check.status === 'pass').length;
  $('doctor-summary').textContent = `${passes}/${checks.length} OK`;
}

function renderReports(reports) {
  const list = $('reports-list');
  list.replaceChildren();
  if (!reports.length) {
    const item = document.createElement('li');
    item.className = 'empty-state';
    item.textContent = 'Noch keine Reports vorhanden.';
    list.append(item);
    return;
  }
  for (const report of reports.slice(0, 8)) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'report-button';
    const task = document.createElement('strong');
    task.textContent = report.task;
    const meta = document.createElement('span');
    meta.textContent = `${report.runId} · ${report.status}`;
    button.append(task, meta);
    button.addEventListener('click', () => void openReport(report.runId));
    item.append(button);
    list.append(item);
  }
}

async function openReport(runId) {
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(runId)}`);
    if (!response.ok) throw new Error(`Report konnte nicht geladen werden (${response.status}).`);
    $('report-viewer').textContent = await response.text();
    $('report-title').textContent = runId;
    $('report-dialog').showModal();
  } catch (error) {
    showError(messageOf(error));
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { method: options.method || 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['x-loop-csrf'] = state.csrfToken;
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload.details?.map((item) => `${item.path}: ${item.message}`).join('; ');
    throw new Error(details || payload.error || `Anfrage fehlgeschlagen (${response.status}).`);
  }
  return payload;
}

function setRunningControls(running) {
  $('start-button').disabled = running;
  $('start-button').querySelector('span').textContent = running ? 'Loop läuft …' : 'Loop starten';
  $('cancel-button').hidden = !running;
}

function showError(message) {
  const field = $('form-error');
  field.hidden = !message;
  field.textContent = message;
}

function setConnection(status, label) {
  const element = $('app-status');
  element.className = `connection ${status}`;
  element.lastChild.textContent = label;
}

function updateTaskCount() {
  $('task-count').textContent = `${$('task').value.length.toLocaleString('de-CH')} / 20.000`;
}

function setupTheme() {
  const stored = localStorage.getItem('loopeng-theme');
  const theme = stored || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
  $('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('loopeng-theme', next);
  });
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
