/**
 * Main Application Orchestrator
 * 
 * Manages SPA state transitions, navigation, onboarding, tracking form
 * submissions, challenges actions, theme switches, and browser diagnostics.
 */

import { 
  getUserProfile, 
  saveUserProfile, 
  getLogs, 
  saveLog, 
  deleteLog, 
  toggleChallengeSubscription, 
  recordChallengeCompletion, 
  clearAllData 
} from './db.js';

import { 
  calculateTotalEmissions, 
  calculateTransportEmissions,
  calculateEnergyEmissions,
  calculateDietEmissions,
  calculateWasteEmissions
} from './calculator.js';

import { 
  updateBudgetCircle, 
  renderCategoryWidgets, 
  renderTrendsChart, 
  generateInsights 
} from './dashboard.js';

import { 
  getActiveChallengesDetails, 
  calculateTotalSavings 
} from './challenges.js';

import { runClientTests } from './tests.js';

// Application State
const STATE = {
  profile: null,
  logs: [],
  activeView: 'dashboard',
  selectedLogDate: new Date().toISOString().split('T')[0],
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth()
};

// DOM Elements cache
const elements = {};

/**
 * Initialize DOM element cache
 */
function cacheElements() {
  elements.body = document.body;
  elements.navLinks = document.querySelectorAll('.nav-link');
  elements.views = document.querySelectorAll('.app-view');
  
  // Header details
  elements.themeToggle = document.getElementById('theme-toggle');
  elements.profileBadge = document.getElementById('profile-badge');
  elements.profileName = document.getElementById('profile-name');
  
  // Onboarding Wizard
  elements.wizardOverlay = document.getElementById('wizard-overlay');
  elements.wizardDots = document.querySelectorAll('.wizard-dot');
  elements.wizardSteps = document.querySelectorAll('.wizard-step');
  elements.btnWizardNext = document.getElementById('wizard-next');
  elements.btnWizardPrev = document.getElementById('wizard-prev');
  elements.wizardNameInput = document.getElementById('wizard-name');
  elements.wizardTargetInput = document.getElementById('wizard-target');
  elements.wizardCountryInput = document.getElementById('wizard-country');
  
  // Log tracker form
  elements.trackerForm = document.getElementById('tracker-form');
  elements.btnToday = document.getElementById('btn-log-today');
  elements.cleanEnergySlider = document.getElementById('electricityCleanPercent');
  elements.cleanEnergyVal = document.getElementById('slider-val-clean');
  elements.selectedDateDisplay = document.getElementById('selected-date-display');
  
  // Calendar
  elements.calGrid = document.getElementById('cal-grid');
  elements.calMonthLabel = document.getElementById('cal-month-label');
  elements.calPrev = document.getElementById('cal-prev');
  elements.calNext = document.getElementById('cal-next');
  
  // Dialog modal settings
  elements.settingsModal = document.getElementById('settings-modal');
  elements.btnCloseSettings = document.getElementById('btn-close-settings');
  elements.btnCancelSettings = document.getElementById('btn-cancel-settings');
  elements.settingsForm = document.getElementById('settings-form');
  
  // Dynamic Containers
  elements.insightsContainer = document.getElementById('insights-container');
  elements.historyList = document.getElementById('history-list');
  elements.challengesGrid = document.getElementById('challenges-grid');
  elements.totalSavingsBadge = document.getElementById('total-savings-badge');
  
  // Diagnostics
  elements.btnRunTests = document.getElementById('btn-run-tests');
  elements.btnResetData = document.getElementById('btn-reset-data');
  elements.testLogConsole = document.getElementById('test-log-console');
  elements.testPassedCount = document.getElementById('test-passed-count');
  elements.testFailedCount = document.getElementById('test-failed-count');
}

/**
 * Display toast notification dynamically.
 * @param {string} message - Toast text.
 * @param {string} [type='success'] - 'success', 'error', 'info'.
 */
export function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.role = 'alert';
  
  const iconSpan = document.createElement('span');
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.textContent = type === 'error' ? '❌' : (type === 'info' ? 'ℹ️' : '✅');
  
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  
  toast.appendChild(iconSpan);
  toast.appendChild(textSpan);
  container.appendChild(toast);

  // Animate slide-out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Traps keyboard focus within an overlay container (Wizard or Settings dialog).
 * @param {KeyboardEvent} e - Keyboard event.
 * @param {HTMLElement} container - Target container element.
 */
function trapFocus(e, container) {
  if (e.key !== 'Tab') return;
  const focusables = Array.from(container.querySelectorAll('button, [href], input, select, textarea'))
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      last.focus();
      e.preventDefault();
    }
  } else {
    if (document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  // Navigation tabs routing
  elements.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = link.getAttribute('data-view');
      switchView(targetView);
    });
  });

  // Theme switch
  elements.themeToggle.addEventListener('click', toggleTheme);

  // Settings modal operations
  elements.profileBadge?.addEventListener('click', openSettingsModal);
  elements.btnCloseSettings?.addEventListener('click', closeSettingsModal);
  elements.btnCancelSettings?.addEventListener('click', closeSettingsModal);
  elements.settingsModal?.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettingsModal();
  });
  elements.settingsForm?.addEventListener('submit', handleSettingsSave);

  // Clean energy slider values display update
  elements.cleanEnergySlider?.addEventListener('input', (e) => {
    elements.cleanEnergyVal.textContent = `${e.target.value}%`;
  });

  // Track emissions form submit
  elements.trackerForm?.addEventListener('submit', handleLogSubmission);

  // Today button calendar jump
  elements.btnToday?.addEventListener('click', () => {
    const today = new Date();
    STATE.selectedLogDate = today.toISOString().split('T')[0];
    STATE.calendarYear = today.getFullYear();
    STATE.calendarMonth = today.getMonth();
    renderCalendar();
    updateSelectedDateDisplay();
    loadLogForSelectedDate();
  });

  // Calendar month navigation
  elements.calPrev?.addEventListener('click', () => {
    STATE.calendarMonth--;
    if (STATE.calendarMonth < 0) {
      STATE.calendarMonth = 11;
      STATE.calendarYear--;
    }
    renderCalendar();
  });

  elements.calNext?.addEventListener('click', () => {
    STATE.calendarMonth++;
    if (STATE.calendarMonth > 11) {
      STATE.calendarMonth = 0;
      STATE.calendarYear++;
    }
    renderCalendar();
  });

  // Onboarding Wizard controls
  let currentWizardStep = 0;
  elements.btnWizardNext?.addEventListener('click', () => {
    if (validateWizardStep(currentWizardStep)) {
      if (currentWizardStep < elements.wizardSteps.length - 1) {
        currentWizardStep++;
        updateWizardStep(currentWizardStep);
      } else {
        completeWizard();
      }
    }
  });

  elements.btnWizardPrev?.addEventListener('click', () => {
    if (currentWizardStep > 0) {
      currentWizardStep--;
      updateWizardStep(currentWizardStep);
    }
  });

  // Dialog keyboard focus traps
  elements.wizardOverlay.addEventListener('keydown', (e) => {
    trapFocus(e, elements.wizardOverlay);
  });
  elements.settingsModal.addEventListener('keydown', (e) => {
    trapFocus(e, elements.settingsModal);
  });

  // System Diagnostics trigger
  elements.btnRunTests?.addEventListener('click', runSystemDiagnostics);
  elements.btnResetData?.addEventListener('click', handleResetDataRequest);
}

/**
 * View Routing
 * @param {string} viewName - Name of view to show.
 */
function switchView(viewName) {
  STATE.activeView = viewName;
  
  elements.views.forEach(view => {
    if (view.id === `${viewName}-view`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  elements.navLinks.forEach(link => {
    if (link.getAttribute('data-view') === viewName) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  // Run specific view refreshes
  if (viewName === 'dashboard') {
    refreshDashboard();
  } else if (viewName === 'logger') {
    renderCalendar();
    updateSelectedDateDisplay();
    loadLogForSelectedDate();
    refreshHistoryList();
  } else if (viewName === 'challenges') {
    refreshChallengesView();
  }
}

/**
 * Theme Operations
 */
function toggleTheme() {
  const isLight = elements.body.classList.toggle('light-theme');
  localStorage.setItem('cfap_theme', isLight ? 'light' : 'dark');
  elements.themeToggle.textContent = isLight ? '🌙' : '☀️';
  elements.themeToggle.setAttribute('aria-label', isLight ? 'Switch to Dark Theme' : 'Switch to Light Theme');
}

function loadThemePreference() {
  const saved = localStorage.getItem('cfap_theme');
  if (saved === 'light') {
    elements.body.classList.add('light-theme');
    elements.themeToggle.textContent = '🌙';
    elements.themeToggle.setAttribute('aria-label', 'Switch to Dark Theme');
  } else {
    elements.body.classList.remove('light-theme');
    elements.themeToggle.textContent = '☀️';
    elements.themeToggle.setAttribute('aria-label', 'Switch to Light Theme');
  }
}

/**
 * Onboarding Wizard steps logic
 */
function checkOnboarding() {
  STATE.profile = getUserProfile();
  if (!STATE.profile.onboarded) {
    elements.wizardOverlay.classList.add('active');
    elements.wizardOverlay.setAttribute('aria-hidden', 'false');
    updateWizardStep(0);
  } else {
    elements.wizardOverlay.classList.remove('active');
    elements.wizardOverlay.setAttribute('aria-hidden', 'true');
    initializeDashboard();
  }
}

/**
 * Update active wizard view step.
 * @param {number} stepIdx - Wizard step index.
 */
function updateWizardStep(stepIdx) {
  elements.wizardSteps.forEach((step, idx) => {
    step.classList.toggle('active', idx === stepIdx);
  });
  
  elements.wizardDots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === stepIdx);
  });

  if (stepIdx === 0) {
    elements.btnWizardPrev.classList.add('hidden');
  } else {
    elements.btnWizardPrev.classList.remove('hidden');
  }
  
  elements.btnWizardNext.textContent = stepIdx === elements.wizardSteps.length - 1 ? 'Get Started' : 'Next Step';

  // Accessible keyboard focus placement
  setTimeout(() => {
    if (stepIdx === 0) {
      elements.wizardNameInput.focus();
    } else if (stepIdx === 1) {
      elements.wizardTargetInput.focus();
    } else if (stepIdx === 2) {
      elements.wizardCountryInput.focus();
    }
  }, 50);
}

/**
 * Validates active wizard inputs before allowing step transitions.
 * @param {number} stepIdx - Wizard step index to validate.
 * @returns {boolean} True if inputs are valid.
 */
function validateWizardStep(stepIdx) {
  if (stepIdx === 0) {
    const name = elements.wizardNameInput.value.trim();
    if (!name) {
      showToast('Please enter your name', 'error');
      elements.wizardNameInput.focus();
      return false;
    }
  } else if (stepIdx === 1) {
    const target = Number(elements.wizardTargetInput.value);
    if (isNaN(target) || target <= 0) {
      showToast('Please specify a positive emissions target limit', 'error');
      elements.wizardTargetInput.focus();
      return false;
    }
  }
  return true;
}

/**
 * Commits profile choices, onboarding completes.
 */
function completeWizard() {
  const newProfile = {
    name: elements.wizardNameInput.value.trim(),
    dailyTarget: Number(elements.wizardTargetInput.value),
    country: elements.wizardCountryInput.value,
    onboarded: true
  };
  saveUserProfile(newProfile);
  STATE.profile = getUserProfile();
  elements.wizardOverlay.classList.remove('active');
  elements.wizardOverlay.setAttribute('aria-hidden', 'true');
  
  showToast(`Welcome ${STATE.profile.name}! Your profile is initialized.`);
  initializeDashboard();
}

/**
 * Dashboard & Statistics Updates
 */
function initializeDashboard() {
  elements.profileName.textContent = STATE.profile.name;
  STATE.logs = getLogs();
  refreshDashboard();
}

function refreshDashboard() {
  STATE.logs = getLogs();
  
  const latestLog = STATE.logs[0] || null;
  const target = STATE.profile.dailyTarget;
  const totalSavings = calculateTotalSavings();
  
  elements.totalSavingsBadge.textContent = `${totalSavings.toFixed(1)} kg`;
  
  const currentEmissions = latestLog ? latestLog.totalEmissions : 0;
  updateBudgetCircle(currentEmissions, target);
  renderCategoryWidgets(latestLog);
  renderTrendsChart(STATE.logs);
  renderInsights(latestLog, target);
}

/**
 * Renders insight lists.
 * @param {Object} latestLog - Most recent log.
 * @param {number} target - Budget target.
 */
function renderInsights(latestLog, target) {
  elements.insightsContainer.textContent = '';
  const insights = generateInsights(latestLog, target);
  
  insights.forEach(ins => {
    const card = document.createElement('div');
    card.className = `insight-card ${ins.type === 'warning' ? 'warning' : ''} ${ins.type === 'success' ? 'success' : ''}`;
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'insight-icon';
    iconDiv.setAttribute('aria-hidden', 'true');
    iconDiv.textContent = ins.icon;
    
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'insight-details';
    
    const titleH4 = document.createElement('h4');
    titleH4.className = 'insight-title';
    titleH4.textContent = ins.title;
    
    const textP = document.createElement('p');
    textP.className = 'insight-text';
    textP.textContent = ins.text;
    
    detailsDiv.appendChild(titleH4);
    detailsDiv.appendChild(textP);
    
    card.appendChild(iconDiv);
    card.appendChild(detailsDiv);
    elements.insightsContainer.appendChild(card);
  });
}

/**
 * Settings Modal handlers
 */
function openSettingsModal() {
  const profile = getUserProfile();
  
  document.getElementById('settings-name').value = profile.name;
  document.getElementById('settings-target').value = profile.dailyTarget;
  document.getElementById('settings-country').value = profile.country;
  
  elements.settingsModal.classList.add('active');
  elements.settingsModal.setAttribute('aria-hidden', 'false');
  document.getElementById('settings-name').focus();
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove('active');
  elements.settingsModal.setAttribute('aria-hidden', 'true');
  elements.profileBadge?.focus();
}

/**
 * Profile settings save submission callback.
 * @param {Event} e - Form submit event.
 */
function handleSettingsSave(e) {
  e.preventDefault();
  const name = document.getElementById('settings-name').value.trim();
  const target = Number(document.getElementById('settings-target').value);
  const country = document.getElementById('settings-country').value;

  if (!name || isNaN(target) || target <= 0) {
    showToast('Invalid parameters in profile settings', 'error');
    return;
  }

  saveUserProfile({ name, dailyTarget: target, country });
  STATE.profile = getUserProfile();
  elements.profileName.textContent = STATE.profile.name;
  
  closeSettingsModal();
  showToast('Profile configuration updated successfully!');
  
  if (STATE.activeView === 'dashboard') {
    refreshDashboard();
  }
}

/**
 * Emissions Tracking Logger Logic
 */
function loadLogForSelectedDate() {
  // Reset form and clean energy display text
  elements.trackerForm.reset();
  elements.cleanEnergyVal.textContent = '0%';

  const logs = getLogs();
  const log = logs.find(l => l.date === STATE.selectedLogDate);

  if (log) {
    // Fill form elements
    // Transport
    document.getElementById('carKm').value = log.transport.carKm || '';
    document.getElementById('carFuelType').value = log.transport.carFuelType || 'petrol';
    document.getElementById('busKm').value = log.transport.busKm || '';
    document.getElementById('trainKm').value = log.transport.trainKm || '';
    document.getElementById('flightShortHours').value = log.transport.flightShortHours || '';
    document.getElementById('flightLongHours').value = log.transport.flightLongHours || '';

    // Energy
    document.getElementById('electricityKwh').value = log.energy.electricityKwh || '';
    document.getElementById('electricityCleanPercent').value = log.energy.electricityCleanPercent || 0;
    elements.cleanEnergyVal.textContent = `${log.energy.electricityCleanPercent || 0}%`;
    document.getElementById('gasKwh').value = log.energy.gasKwh || '';
    document.getElementById('heatingOilKwh').value = log.energy.heatingOilKwh || '';
    document.getElementById('waterM3').value = log.energy.waterM3 || '';

    // Diet
    document.getElementById('dietType').value = log.diet.dietType || 'mediumMeat';

    // Waste
    document.getElementById('landfillKg').value = log.waste.landfillKg || '';
    document.getElementById('recycledKg').value = log.waste.recycledKg || '';
    document.getElementById('compostKg').value = log.waste.compostKg || '';
    document.getElementById('clothingCount').value = log.waste.clothingCount || '';
    document.getElementById('electronicsCount').value = log.waste.electronicsCount || '';
    document.getElementById('appliancesCount').value = log.waste.appliancesCount || '';
    document.getElementById('furnitureCount').value = log.waste.furnitureCount || '';
  }
}

/**
 * Form save log entry callback.
 * @param {Event} e - Submit event.
 */
function handleLogSubmission(e) {
  e.preventDefault();

  const date = STATE.selectedLogDate;
  if (!date) {
    showToast('Please select a date on the calendar first.', 'error');
    return;
  }

  const formData = new FormData(elements.trackerForm);

  const log = {
    date: date,
    transport: {
      carKm: Number(formData.get('carKm')),
      carFuelType: formData.get('carFuelType'),
      busKm: Number(formData.get('busKm')),
      trainKm: Number(formData.get('trainKm')),
      flightShortHours: Number(formData.get('flightShortHours')),
      flightLongHours: Number(formData.get('flightLongHours'))
    },
    energy: {
      electricityKwh: Number(formData.get('electricityKwh')),
      electricityCleanPercent: Number(formData.get('electricityCleanPercent')),
      gasKwh: Number(formData.get('gasKwh')),
      heatingOilKwh: Number(formData.get('heatingOilKwh')),
      waterM3: Number(formData.get('waterM3'))
    },
    diet: {
      dietType: formData.get('dietType'),
      daysCount: 1
    },
    waste: {
      landfillKg: Number(formData.get('landfillKg')),
      recycledKg: Number(formData.get('recycledKg')),
      compostKg: Number(formData.get('compostKg')),
      clothingCount: Number(formData.get('clothingCount')),
      electronicsCount: Number(formData.get('electronicsCount')),
      appliancesCount: Number(formData.get('appliancesCount')),
      furnitureCount: Number(formData.get('furnitureCount'))
    }
  };

  log.totalEmissions = calculateTotalEmissions(log);
  saveLog(log);
  showToast(`Daily footprint for ${date} saved: ${log.totalEmissions.toFixed(1)} kg CO2e.`);

  renderCalendar();
  refreshHistoryList();
}

function refreshHistoryList() {
  elements.historyList.textContent = '';
  const logs = getLogs();

  if (logs.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    const emptyText = document.createElement('p');
    emptyText.textContent = 'No historical logged entries. Complete the tracking form to save logs.';
    emptyDiv.appendChild(emptyText);
    elements.historyList.appendChild(emptyDiv);
    return;
  }

  logs.forEach(log => {
    const item = document.createElement('div');
    item.className = 'history-item';
    
    const dateObj = new Date(log.date);
    const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    
    const transport = calculateTransportEmissions(log.transport).toFixed(0);
    const energy = calculateEnergyEmissions(log.energy).toFixed(0);
    const diet = calculateDietEmissions(log.diet).toFixed(0);
    const waste = calculateWasteEmissions(log.waste).toFixed(0);

    const historyMeta = document.createElement('div');
    historyMeta.className = 'history-meta';
    
    const historyDate = document.createElement('span');
    historyDate.className = 'history-date';
    historyDate.textContent = dateStr;
    
    const historyDetails = document.createElement('div');
    historyDetails.className = 'history-details';
    
    const tSpan = document.createElement('span');
    tSpan.textContent = `🚗 Transit: ${transport}kg`;
    const eSpan = document.createElement('span');
    eSpan.textContent = `⚡ Energy: ${energy}kg`;
    const dSpan = document.createElement('span');
    dSpan.textContent = `🥗 Diet: ${diet}kg`;
    const wSpan = document.createElement('span');
    wSpan.textContent = `♻️ Waste: ${waste}kg`;
    
    historyDetails.appendChild(tSpan);
    historyDetails.appendChild(eSpan);
    historyDetails.appendChild(dSpan);
    historyDetails.appendChild(wSpan);
    
    historyMeta.appendChild(historyDate);
    historyMeta.appendChild(historyDetails);
    
    const historyEmissions = document.createElement('div');
    historyEmissions.className = 'history-emissions';
    
    const historyVal = document.createElement('span');
    historyVal.className = 'history-val';
    historyVal.textContent = `${log.totalEmissions.toFixed(1)} kg CO2e`;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-log';
    deleteBtn.setAttribute('data-id', log.id);
    deleteBtn.setAttribute('aria-label', `Delete entry for ${log.date}`);
    deleteBtn.textContent = '🗑️';
    
    // Deletion confirmation handler
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to remove the log entry for ${log.date}?`)) {
        deleteLog(log.id);
        refreshHistoryList();
        renderCalendar();
        showToast('Log entry removed', 'info');
      }
    });
    
    historyEmissions.appendChild(historyVal);
    historyEmissions.appendChild(deleteBtn);
    
    item.appendChild(historyMeta);
    item.appendChild(historyEmissions);

    elements.historyList.appendChild(item);
  });
}

/**
 * Accessible Calendar Table rendering.
 * Renders weeks in tr rows and days inside td elements.
 */
function renderCalendar() {
  if (!elements.calGrid) return;

  const year = STATE.calendarYear;
  const month = STATE.calendarMonth;
  const todayStr = new Date().toISOString().split('T')[0];

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  elements.calMonthLabel.textContent = `${monthNames[month]} ${year}`;

  const logs = getLogs();
  const loggedDates = new Set(logs.map(l => l.date));

  // First day weekday offset (0=Sun, 6=Sat)
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  elements.calGrid.textContent = '';

  let currentTr = document.createElement('tr');
  elements.calGrid.appendChild(currentTr);

  // Pre-fill empty columns
  for (let i = 0; i < firstDay; i++) {
    const emptyTd = document.createElement('td');
    emptyTd.className = 'cal-cell cal-cell--empty';
    currentTr.appendChild(emptyTd);
  }

  let cellCount = firstDay;

  // Insert active days
  for (let d = 1; d <= daysInMonth; d++) {
    if (cellCount === 7) {
      currentTr = document.createElement('tr');
      elements.calGrid.appendChild(currentTr);
      cellCount = 0;
    }

    const td = document.createElement('td');
    td.className = 'cal-cell';

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = d;
    btn.setAttribute('aria-label', `${monthNames[month]} ${d}, ${year}`);

    if (dateStr === todayStr) btn.classList.add('cal-day--today');
    if (loggedDates.has(dateStr)) btn.classList.add('cal-day--logged');
    if (dateStr === STATE.selectedLogDate) btn.classList.add('cal-day--selected');

    btn.addEventListener('click', () => {
      STATE.selectedLogDate = dateStr;
      renderCalendar();
      updateSelectedDateDisplay();
      loadLogForSelectedDate();
    });

    td.appendChild(btn);
    currentTr.appendChild(td);
    cellCount++;
  }

  // Post-fill empty columns to complete week structure
  if (cellCount < 7) {
    for (let i = cellCount; i < 7; i++) {
      const emptyTd = document.createElement('td');
      emptyTd.className = 'cal-cell cal-cell--empty';
      currentTr.appendChild(emptyTd);
    }
  }
}

/**
 * Updates Selected Date display banner text.
 */
function updateSelectedDateDisplay() {
  if (!elements.selectedDateDisplay) return;
  const dateObj = new Date(STATE.selectedLogDate + 'T00:00:00');
  const todayStr = new Date().toISOString().split('T')[0];
  if (STATE.selectedLogDate === todayStr) {
    elements.selectedDateDisplay.textContent = 'Today — ' + dateObj.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
  } else {
    elements.selectedDateDisplay.textContent = dateObj.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
  }
}

/**
 * Challenges Management View Rendering
 */
function refreshChallengesView() {
  elements.challengesGrid.textContent = '';
  const challenges = getActiveChallengesDetails();
  const todayStr = new Date().toISOString().split('T')[0];

  challenges.forEach(c => {
    const card = document.createElement('div');
    card.className = 'glass-card challenge-card';
    
    if (c.activated) {
      const activeBadge = document.createElement('span');
      activeBadge.className = 'challenge-badge-active';
      activeBadge.textContent = 'Active';
      card.appendChild(activeBadge);
    }
    
    const header = document.createElement('div');
    header.className = 'challenge-header';
    
    const icon = document.createElement('div');
    icon.className = 'challenge-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = c.icon;
    
    const meta = document.createElement('div');
    meta.className = 'challenge-meta';
    
    const title = document.createElement('h3');
    title.className = 'challenge-title';
    title.textContent = c.title;
    
    const saving = document.createElement('span');
    saving.className = 'challenge-saving';
    saving.textContent = `Saves ~${c.co2SavedPerDay} kg CO2/day`;
    
    meta.appendChild(title);
    meta.appendChild(saving);
    header.appendChild(icon);
    header.appendChild(meta);
    card.appendChild(header);
    
    const desc = document.createElement('p');
    desc.className = 'challenge-desc';
    desc.textContent = c.description;
    card.appendChild(desc);
    
    const stats = document.createElement('div');
    stats.className = 'challenge-stats';
    
    const completedSpan = document.createElement('span');
    completedSpan.textContent = `Completed: ${c.completedCount} times`;
    stats.appendChild(completedSpan);
    
    if (c.streak > 0) {
      const streakSpan = document.createElement('span');
      streakSpan.className = 'challenge-streak';
      streakSpan.setAttribute('aria-label', `Streak of ${c.streak} days`);
      streakSpan.textContent = `🔥 ${c.streak} Day Streak`;
      stats.appendChild(streakSpan);
    }
    card.appendChild(stats);
    
    const actions = document.createElement('div');
    actions.className = 'challenge-actions';
    
    const subBtn = document.createElement('button');
    subBtn.className = 'btn btn-secondary btn-sub';
    subBtn.setAttribute('data-id', c.id);
    subBtn.textContent = c.activated ? 'Unsubscribe' : 'Subscribe';
    
    const compBtn = document.createElement('button');
    compBtn.className = 'btn btn-primary btn-comp';
    compBtn.setAttribute('data-id', c.id);
    if (!c.activated || c.lastCompleted === todayStr) {
      compBtn.disabled = true;
    }
    compBtn.textContent = c.lastCompleted === todayStr ? 'Completed Today' : 'Log Success';
    
    actions.appendChild(subBtn);
    actions.appendChild(compBtn);
    card.appendChild(actions);

    // Dynamic subscription listeners
    subBtn.addEventListener('click', () => {
      toggleChallengeSubscription(c.id);
      refreshChallengesView();
      showToast(`${c.title} ${c.activated ? 'deactivated' : 'activated!'}`);
    });

    compBtn.addEventListener('click', () => {
      const updated = recordChallengeCompletion(c.id, todayStr);
      if (!updated) {
        showToast('Could not log completion for this challenge.', 'error');
        return;
      }
      refreshChallengesView();
      showToast(`Logged success! You saved ${c.co2SavedPerDay} kg CO2 today. Streak is now ${updated.streak}!`);
    });

    elements.challengesGrid.appendChild(card);
  });
}

/**
 * Diagnostics & Test execution in browser
 */
function runSystemDiagnostics() {
  elements.testLogConsole.textContent = '';
  elements.testPassedCount.textContent = '0';
  elements.testFailedCount.textContent = '0';

  runClientTests((msg, style) => {
    const line = document.createElement('div');
    line.className = `test-log-entry ${style || ''}`;
    line.textContent = msg;
    elements.testLogConsole.appendChild(line);
    elements.testLogConsole.scrollTop = elements.testLogConsole.scrollHeight;
  }).then(results => {
    elements.testPassedCount.textContent = String(results.passed);
    elements.testFailedCount.textContent = String(results.failed);
    
    if (results.failed === 0) {
      showToast('All browser unit validation checks passed!', 'success');
    } else {
      showToast(`${results.failed} tests failed. Check console output.`, 'error');
    }
  });
}

function handleResetDataRequest() {
  if (confirm('CAUTION: This will permanently wipe all logs, challenges, and settings details. Are you sure you want to proceed?')) {
    clearAllData();
    showToast('Platform databases cleared.', 'info');
    checkOnboarding();
    switchView('dashboard');
  }
}

// Initial application bootstrap
window.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  setupEventListeners();
  loadThemePreference();
  checkOnboarding();
});
