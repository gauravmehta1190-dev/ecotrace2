/**
 * Data Storage Manager (LocalStorage Wrapper)
 * 
 * Secure and robust client-side storage for the Carbon Footprint Awareness Platform.
 * Prevents script-injection and guarantees clean state parsing.
 */

// LocalStorage Keys
const KEYS = {
  PROFILE: 'cfap_user_profile',
  LOGS: 'cfap_emission_logs',
  CHALLENGES: 'cfap_challenges_progress'
};

// Default profile structure
const DEFAULT_PROFILE = {
  name: 'Eco Warrior',
  dailyTarget: 15.0, // Standard daily target (in kg CO2e)
  country: 'US',
  onboarded: false,
  joinedDate: new Date().toISOString().split('T')[0]
};

// Initial system challenges
export const PRESETS_CHALLENGES = [
  {
    id: 'meatless_day',
    title: 'Meat-Free Day',
    description: 'Opt for a vegetarian or vegan diet for the entire day.',
    co2SavedPerDay: 2.5,
    category: 'diet',
    icon: '🥕'
  },
  {
    id: 'commute_green',
    title: 'Active Commuting',
    description: 'Walk, cycle, or use public transit instead of driving a car today.',
    co2SavedPerDay: 4.8,
    category: 'transport',
    icon: '🚲'
  },
  {
    id: 'energy_saver',
    title: 'Standby Slash',
    description: 'Turn off power strips and unplug idle electronics for the night.',
    co2SavedPerDay: 0.9,
    category: 'energy',
    icon: '🔌'
  },
  {
    id: 'cold_wash',
    title: 'Cold Laundry Cycle',
    description: 'Wash all clothes at 30°C or cold wash, then air-dry instead of tumble drying.',
    co2SavedPerDay: 1.2,
    category: 'energy',
    icon: '👕'
  },
  {
    id: 'zero_waste_day',
    title: 'Zero Waste Challenge',
    description: 'Avoid single-use plastics, recycle fully, and compost organic matter today.',
    co2SavedPerDay: 1.5,
    category: 'waste',
    icon: '♻️'
  }
];

/**
 * Securely sanitizes text input to prevent XSS / script injections.
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Safe local storage read wrapper.
 */
function readStorage(key, fallback = null) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.error(`Failed to read storage key: ${key}`, e);
    return fallback;
  }
}

/**
 * Safe local storage write wrapper.
 */
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Failed to write storage key: ${key}`, e);
    return false;
  }
}

/**
 * USER PROFILE UTILITIES
 */
export function getUserProfile() {
  const profile = readStorage(KEYS.PROFILE, DEFAULT_PROFILE);
  const validated = { ...DEFAULT_PROFILE };
  
  if (profile && typeof profile === 'object') {
    if (typeof profile.name === 'string' && profile.name.trim()) {
      validated.name = profile.name;
    }
    if (typeof profile.dailyTarget === 'number' && !isNaN(profile.dailyTarget) && profile.dailyTarget > 0) {
      validated.dailyTarget = profile.dailyTarget;
    }
    const validCountries = ['US', 'EU', 'IN', 'GL'];
    if (validCountries.includes(profile.country)) {
      validated.country = profile.country;
    }
    validated.onboarded = !!profile.onboarded;
    if (typeof profile.joinedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profile.joinedDate)) {
      validated.joinedDate = profile.joinedDate;
    }
  }
  return validated;
}

export function saveUserProfile(profileData) {
  const current = getUserProfile();
  const validCountries = ['US', 'EU', 'IN', 'GL'];
  
  let name = typeof profileData.name === 'string' ? profileData.name.trim() : current.name;
  if (!name) name = current.name;
  
  let dailyTarget = Number(profileData.dailyTarget);
  if (isNaN(dailyTarget) || !isFinite(dailyTarget) || dailyTarget <= 0) {
    dailyTarget = current.dailyTarget;
  }
  
  let country = profileData.country;
  if (!validCountries.includes(country)) {
    country = validCountries.includes(current.country) ? current.country : 'GL';
  }

  const updated = {
    name: name,
    dailyTarget: dailyTarget,
    country: country,
    onboarded: profileData.onboarded !== undefined ? !!profileData.onboarded : current.onboarded,
    joinedDate: current.joinedDate
  };
  return writeStorage(KEYS.PROFILE, updated);
}

/**
 * Validates and cleans a log entry structure.
 */
function validateLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id : `log-${Date.now()}`;
  
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof entry.date !== 'string' || !datePattern.test(entry.date)) {
    return null;
  }
  
  const validateNestedObject = (obj) => {
    if (!obj || typeof obj !== 'object') return {};
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') {
        cleaned[key] = isNaN(value) || !isFinite(value) ? 0 : Math.max(0, value);
      } else if (typeof value === 'string') {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  return {
    id: id,
    date: entry.date,
    transport: validateNestedObject(entry.transport),
    energy: validateNestedObject(entry.energy),
    diet: validateNestedObject(entry.diet),
    waste: validateNestedObject(entry.waste),
    totalEmissions: typeof entry.totalEmissions === 'number' && !isNaN(entry.totalEmissions) && isFinite(entry.totalEmissions)
      ? Math.max(0, entry.totalEmissions)
      : 0,
    timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString()
  };
}

/**
 * LOGS UTILITIES
 */
export function getLogs() {
  const logs = readStorage(KEYS.LOGS, []);
  if (!Array.isArray(logs)) return [];
  
  const validatedLogs = logs
    .map(validateLogEntry)
    .filter(log => log !== null);
    
  return validatedLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getLogByDate(dateString) {
  const logs = getLogs();
  return logs.find(log => log.date === dateString) || null;
}

export function saveLog(logEntry) {
  if (!logEntry || !logEntry.date) {
    throw new Error('Log entry must contain a valid ISO date string (YYYY-MM-DD)');
  }

  const cleanEntry = validateLogEntry(logEntry);
  if (!cleanEntry) {
    throw new Error('Invalid log entry structure');
  }

  const logs = getLogs();
  const existingIndex = logs.findIndex(log => log.date === cleanEntry.date);

  if (existingIndex !== -1) {
    logs[existingIndex] = cleanEntry;
  } else {
    logs.push(cleanEntry);
  }

  return writeStorage(KEYS.LOGS, logs);
}

export function deleteLog(logId) {
  const logs = getLogs();
  const filtered = logs.filter(log => log.id !== logId);
  return writeStorage(KEYS.LOGS, filtered);
}

/**
 * CHALLENGES UTILITIES
 */
export function getChallengesProgress() {
  const progress = readStorage(KEYS.CHALLENGES, {});
  const cleanProgress = {};
  
  PRESETS_CHALLENGES.forEach(c => {
    const prog = (progress && typeof progress === 'object') ? progress[c.id] : null;
    cleanProgress[c.id] = {
      id: c.id,
      activated: prog ? !!prog.activated : false,
      streak: prog && typeof prog.streak === 'number' && !isNaN(prog.streak) ? Math.max(0, prog.streak) : 0,
      completedCount: prog && typeof prog.completedCount === 'number' && !isNaN(prog.completedCount) ? Math.max(0, prog.completedCount) : 0,
      lastCompleted: prog && typeof prog.lastCompleted === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prog.lastCompleted) ? prog.lastCompleted : null
    };
  });
  return cleanProgress;
}

export function toggleChallengeSubscription(challengeId) {
  const progress = getChallengesProgress();
  if (progress[challengeId]) {
    progress[challengeId].activated = !progress[challengeId].activated;
    if (!progress[challengeId].activated) {
      progress[challengeId].streak = 0;
    }
    writeStorage(KEYS.CHALLENGES, progress);
  }
  return progress;
}

export function recordChallengeCompletion(challengeId, dateString) {
  const progress = getChallengesProgress();
  const challenge = progress[challengeId];
  if (!challenge) return null;

  const todayStr = dateString || new Date().toISOString().split('T')[0];
  
  if (challenge.lastCompleted === todayStr) {
    return challenge;
  }

  if (challenge.lastCompleted) {
    const lastDate = new Date(challenge.lastCompleted);
    const currentDate = new Date(todayStr);
    const diffTime = Math.abs(currentDate - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      challenge.streak += 1;
    } else if (diffDays > 1) {
      challenge.streak = 1;
    }
  } else {
    challenge.streak = 1;
  }

  challenge.completedCount += 1;
  challenge.lastCompleted = todayStr;

  writeStorage(KEYS.CHALLENGES, progress);
  return challenge;
}

/**
 * Resets all user databases (useful for testing or profile clearing).
 */
export function clearAllData() {
  localStorage.removeItem(KEYS.PROFILE);
  localStorage.removeItem(KEYS.LOGS);
  localStorage.removeItem(KEYS.CHALLENGES);
  return true;
}
