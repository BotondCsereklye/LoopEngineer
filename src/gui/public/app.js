/* global document, window, fetch, localStorage, matchMedia */

const ROLE_META = {
  analyst: ['Analysis', 'read-only'],
  planner: ['Planning', 'read-only'],
  implementer: ['Implementation', 'workspace-write'],
  reviewer: ['Review', 'read-only'],
  fixer: ['Fixing', 'workspace-write'],
  final_judge: ['Final judgement', 'read-only'],
};

const state = {
  csrfToken: '',
  polling: null,
  providerPolling: null,
  modelCatalog: null,
  connections: [],
  lastSnapshot: { status: 'idle', events: [] },
};
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  $('run-form').addEventListener('submit', startRun);
  $('cancel-button').addEventListener('click', cancelRun);
  $('task').addEventListener('input', updateTaskCount);
  $('close-report').addEventListener('click', () => $('report-dialog').close());
  $('refresh-providers').addEventListener('click', () => void refreshProviders());
  void bootstrap();
});

async function bootstrap() {
  try {
    const data = await api('/api/bootstrap');
    state.csrfToken = data.csrfToken;
    state.modelCatalog = data.modelCatalog;
    $('root-path').textContent = data.root;
    renderRoleSelectors();
    fillConfig(data.config);
    renderDoctor(data.doctor);
    renderReports(data.reports);
    await refreshProviders();
    setConnection('online', 'Connected locally');
    const snapshot = await api('/api/run');
    renderRun(snapshot);
    if (snapshot.status === 'running') startPolling();
  } catch (error) {
    setConnection('error', 'Connection failed');
    showError(messageOf(error));
  }
}

async function refreshProviders() {
  try {
    const connections = await api('/api/providers');
    state.connections = connections;
    renderProviderConnections(connections);
    renderRunProviders(state.lastSnapshot);
    showProviderError('');
    if (connections.some((connection) => connection.state === 'connecting')) {
      startProviderPolling();
    } else {
      stopProviderPolling();
    }
  } catch (error) {
    showProviderError(messageOf(error));
  }
}

function renderProviderConnections(connections) {
  const grid = $('provider-grid');
  grid.replaceChildren();
  for (const connection of connections) {
    const card = document.createElement('article');
    card.className = 'provider-connection-card';

    const header = document.createElement('div');
    header.className = 'provider-connection-header';
    const identity = document.createElement('div');
    identity.className = 'provider-identity';
    const mark = document.createElement('span');
    mark.className = `provider-mark ${connection.id}`;
    mark.textContent = connection.id === 'claude' ? 'C' : 'O';
    const name = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = connection.label;
    const version = document.createElement('span');
    version.textContent =
      connection.version || (connection.installed ? 'Installed' : 'Not installed');
    name.append(title, version);
    identity.append(mark, name);
    const badge = document.createElement('span');
    badge.className = `provider-state ${connection.state}`;
    badge.textContent = providerStateLabel(connection.state);
    header.append(identity, badge);

    const details = document.createElement('p');
    details.textContent = connection.details;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary provider-connect-button';
    button.textContent = providerButtonLabel(connection);
    button.disabled =
      !connection.installed ||
      connection.state === 'connecting' ||
      connection.state === 'connected';
    button.addEventListener('click', () => void connectProvider(connection.id, button));

    card.append(header, details, button);
    grid.append(card);
  }
}

async function connectProvider(provider, button) {
  showProviderError('');
  button.disabled = true;
  button.textContent = 'Opening official sign-in …';
  try {
    const result = await api(`/api/providers/${encodeURIComponent(provider)}/connect`, {
      method: 'POST',
      body: {},
    });
    if (result.status === 'already-connected') {
      await refreshProviders();
      return;
    }
    await refreshProviders();
    startProviderPolling();
  } catch (error) {
    showProviderError(messageOf(error));
    await refreshProviders();
  }
}

function startProviderPolling() {
  if (state.providerPolling !== null) return;
  state.providerPolling = window.setInterval(() => void refreshProviders(), 1_000);
}

function stopProviderPolling() {
  if (state.providerPolling !== null) window.clearInterval(state.providerPolling);
  state.providerPolling = null;
}

function providerStateLabel(providerState) {
  return (
    {
      connected: 'Connected',
      disconnected: 'Sign-in required',
      connecting: 'Signing in',
      unavailable: 'Unavailable',
      unknown: 'Check required',
    }[providerState] || providerState
  );
}

function providerButtonLabel(connection) {
  if (!connection.installed) return 'Install CLI first';
  if (connection.state === 'connected') return 'Connected';
  if (connection.state === 'connecting') return 'Complete in browser';
  return connection.id === 'claude' ? 'Sign in with Claude' : 'Sign in with OpenAI';
}

function renderRoleSelectors() {
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
      emptySelect(`role-${role}-provider`, 'Provider'),
      emptySelect(`role-${role}-model`, 'Model'),
      emptySelect(`role-${role}-effort`, 'Intelligence'),
    );
    card.append(header, controls);
    grid.append(card);

    setSelectOptions(
      $(`role-${role}-provider`),
      Object.entries(state.modelCatalog).map(([id, catalog]) => ({
        value: id,
        label: catalog.label,
      })),
    );
    $(`role-${role}-provider`).addEventListener('change', () => refreshRoleSelectors(role));
    $(`role-${role}-model`).addEventListener('change', () => refreshEffortSelector(role));
    refreshRoleSelectors(role);
  }
}

function emptySelect(id, text) {
  const label = document.createElement('label');
  label.htmlFor = id;
  label.append(document.createTextNode(text));
  const select = document.createElement('select');
  select.id = id;
  label.append(select);
  return label;
}

function setSelectOptions(select, values) {
  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value.value;
    option.textContent = value.label;
    if (value.description) option.title = value.description;
    select.append(option);
  }
}

function refreshRoleSelectors(role, preferredModel, preferredEffort) {
  const provider = $(`role-${role}-provider`).value;
  const catalog = state.modelCatalog[provider];
  const modelSelect = $(`role-${role}-model`);
  setSelectOptions(
    modelSelect,
    catalog.models.map((model) => ({
      value: model.id,
      label: model.label,
      description: model.description,
    })),
  );
  const model = catalog.models.some((entry) => entry.id === preferredModel)
    ? preferredModel
    : catalog.defaultModel;
  modelSelect.value = model;
  refreshEffortSelector(role, preferredEffort);
}

function refreshEffortSelector(role, preferredEffort) {
  const provider = $(`role-${role}-provider`).value;
  const model = $(`role-${role}-model`).value;
  const modelOption = state.modelCatalog[provider].models.find((entry) => entry.id === model);
  if (!modelOption) return;
  const effortSelect = $(`role-${role}-effort`);
  setSelectOptions(
    effortSelect,
    modelOption.efforts.map((effort) => ({ value: effort, label: effortLabel(effort) })),
  );
  effortSelect.value = modelOption.efforts.includes(preferredEffort)
    ? preferredEffort
    : modelOption.defaultEffort;
  effortSelect.title = effortDescription(effortSelect.value);
  effortSelect.onchange = () => {
    effortSelect.title = effortDescription(effortSelect.value);
  };
}

function effortLabel(effort) {
  return (
    {
      auto: 'Automatic',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      xhigh: 'Extra High',
      max: 'Max',
      ultra: 'Ultra',
    }[effort] || effort
  );
}

function effortDescription(effort) {
  return (
    {
      auto: 'Use the provider and model default.',
      low: 'Fast responses with lighter reasoning.',
      medium: 'Balanced speed and reasoning depth.',
      high: 'Deeper reasoning for complex tasks.',
      xhigh: 'Extra-high reasoning depth.',
      max: 'Maximum single-agent reasoning depth.',
      ultra: 'Maximum reasoning with automatic task delegation.',
    }[effort] || ''
  );
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
    refreshRoleSelectors(role, config.roles[role].model, config.roles[role].effort || 'auto');
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
      model: $(`role-${role}-model`).value,
      effort: $(`role-${role}-effort`).value,
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
  if (!request.task) return showError('Please describe a task first.');
  if (!request.qualityGates.blockSeverities.length)
    return showError('Select at least one blocking severity.');
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
  state.lastSnapshot = snapshot;
  const labels = {
    idle: 'Ready',
    running: 'Running',
    completed: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  const badge = $('run-status');
  badge.textContent = labels[snapshot.status] || snapshot.status;
  badge.className = `badge ${snapshot.status}`;
  setRunningControls(snapshot.status === 'running');
  renderRunProviders(snapshot);
  renderRunIssue(snapshot);
  renderActiveAgent(snapshot);

  const summary = $('run-summary');
  summary.replaceChildren();
  if (!snapshot.id && !snapshot.result) {
    summary.className = 'empty-state';
    summary.textContent = 'No run started yet.';
  } else {
    summary.className = 'run-result';
    const title = document.createElement('strong');
    title.textContent =
      snapshot.result?.report?.task || snapshot.task || `Run ${snapshot.id?.slice(0, 8) || ''}`;
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

function renderRunProviders(snapshot) {
  const strip = $('run-provider-strip');
  strip.replaceChildren();
  for (const provider of ['claude', 'codex']) {
    const connection = state.connections.find((item) => item.id === provider);
    if (!connection) continue;
    const item = document.createElement('span');
    const limited = snapshot.issue?.provider === provider;
    item.className = `run-provider ${limited ? 'limited' : connection.state}`;
    const dot = document.createElement('span');
    dot.className = 'mini-dot';
    const label = document.createElement('span');
    label.textContent = `${provider === 'claude' ? 'Claude' : 'Codex'} · ${
      limited ? issueShortLabel(snapshot.issue.kind) : providerStateLabel(connection.state)
    }`;
    item.append(dot, label);
    strip.append(item);
  }
}

function renderRunIssue(snapshot) {
  const issueCard = $('run-issue');
  issueCard.replaceChildren();
  if (!snapshot.issue) {
    issueCard.hidden = true;
    return;
  }
  issueCard.hidden = false;
  const title = document.createElement('strong');
  title.textContent = issueTitle(snapshot.issue.kind);
  const meta = document.createElement('span');
  const provider = snapshot.issue.provider === 'claude' ? 'Claude Code' : 'OpenAI Codex';
  const role = snapshot.issue.role ? ` · ${roleLabel(snapshot.issue.role)}` : '';
  meta.textContent = `${provider}${role}`;
  const detail = document.createElement('p');
  detail.textContent = snapshot.issue.resetAt
    ? `Available again after ${snapshot.issue.resetAt}. Choose the other provider for this role or retry later.`
    : 'This provider cannot continue. Check its sign-in and usage status or choose the other provider.';
  issueCard.append(title, meta, detail);
}

function renderActiveAgent(snapshot) {
  const card = $('active-agent');
  card.replaceChildren();
  if (snapshot.status !== 'running' || !snapshot.active) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const header = document.createElement('div');
  const pulse = document.createElement('span');
  pulse.className = 'thinking-pulse';
  const title = document.createElement('strong');
  title.textContent = `${providerLabel(snapshot.active.provider)} is thinking`;
  header.append(pulse, title);
  const meta = document.createElement('span');
  meta.className = 'active-meta';
  meta.textContent = `${roleLabel(snapshot.active.role)} · ${snapshot.active.model} · ${effortLabel(
    snapshot.active.effort,
  )}`;
  const elapsed = document.createElement('span');
  elapsed.className = 'active-elapsed';
  elapsed.textContent = `${formatElapsed(snapshot.active.startedAt)} elapsed`;
  const note = document.createElement('small');
  note.textContent =
    'Safe progress metadata is shown here; private chain-of-thought is not exposed.';
  card.append(header, meta, elapsed, note);
}

function providerLabel(provider) {
  if (provider === 'claude') return 'Claude Code';
  if (provider === 'codex') return 'OpenAI Codex';
  if (provider === 'local') return 'Local checks';
  return provider;
}

function roleLabel(role) {
  return ROLE_META[role]?.[0] || role.replaceAll('_', ' ');
}

function issueShortLabel(kind) {
  return kind === 'session-limit'
    ? 'Session limit'
    : kind === 'authentication'
      ? 'Sign-in required'
      : 'Unavailable';
}

function issueTitle(kind) {
  return kind === 'session-limit'
    ? 'Session limit reached'
    : kind === 'rate-limit'
      ? 'Usage limit reached'
      : kind === 'authentication'
        ? 'Provider sign-in required'
        : 'Provider unavailable';
}

function formatElapsed(startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, '0')}s` : `${rest}s`;
}

function resultDetail(snapshot) {
  if (snapshot.status === 'running') return 'Agents are working on the task in a controlled loop.';
  if (snapshot.result?.dryRun) return 'Dry run finished — no files were changed.';
  const report = snapshot.result?.report;
  return report
    ? `${report.status} · ${report.diff.filesChanged} file(s) changed`
    : 'Run finished.';
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
    item.textContent = 'No reports yet.';
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
    if (!response.ok) throw new Error(`Could not load the report (${response.status}).`);
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
    throw new Error(details || payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function setRunningControls(running) {
  $('start-button').disabled = running;
  $('start-button').querySelector('span').textContent = running ? 'Loop running …' : 'Start loop';
  $('cancel-button').hidden = !running;
}

function showError(message) {
  const field = $('form-error');
  field.hidden = !message;
  field.textContent = message;
}

function showProviderError(message) {
  const field = $('provider-error');
  field.hidden = !message;
  field.textContent = message;
}

function setConnection(status, label) {
  const element = $('app-status');
  element.className = `connection ${status}`;
  element.lastChild.textContent = label;
}

function updateTaskCount() {
  $('task-count').textContent = `${$('task').value.length.toLocaleString('en-US')} / 20,000`;
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
