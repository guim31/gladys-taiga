// -----------------------------------------------------------------------------
// Gladys devices: one for the Taiga instance, one per followed project.
//
// Identity: `instance` / `instance-main` for the instance (one per
// integration), `project` / `project-<id>` for a project, the numeric id Taiga
// gives it (stable, never its name nor its slug): renaming a project keeps its
// device.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js):
//   instance: reachable                input/binary      1 Taiga answers, 0 otherwise
//   project:  open user stories        counter-sensor/integer
//             open tasks               counter-sensor/integer
//             open issues              counter-sensor/integer
//             overdue items            counter-sensor/integer   (stories, tasks, issues)
//             sprint progress          counter-sensor/integer   % (points, else stories)
//             sprint days left         duration/integer         days
//             current sprint           text/text                its name ("None" without one)
//
// The devices are published with should_poll: false: the integration reads
// Taiga on its own timer (src/hub.js), every 1 to 10 minutes.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const INSTANCE_TYPE = 'instance';
export const PROJECT_TYPE = 'project';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  REACHABLE: 'reachable',
  USER_STORIES: 'open_user_stories',
  TASKS: 'open_tasks',
  ISSUES: 'open_issues',
  OVERDUE: 'overdue',
  SPRINT_PROGRESS: 'sprint_progress',
  SPRINT_DAYS_LEFT: 'sprint_days_left',
  SPRINT: 'sprint',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.REACHABLE]: 'Reachable',
    [FEATURE_KEYS.USER_STORIES]: 'Open user stories',
    [FEATURE_KEYS.TASKS]: 'Open tasks',
    [FEATURE_KEYS.ISSUES]: 'Open issues',
    [FEATURE_KEYS.OVERDUE]: 'Overdue items',
    [FEATURE_KEYS.SPRINT_PROGRESS]: 'Sprint progress',
    [FEATURE_KEYS.SPRINT_DAYS_LEFT]: 'Sprint days left',
    [FEATURE_KEYS.SPRINT]: 'Current sprint',
  },
  fr: {
    [FEATURE_KEYS.REACHABLE]: 'Joignable',
    [FEATURE_KEYS.USER_STORIES]: 'User stories ouvertes',
    [FEATURE_KEYS.TASKS]: 'Tâches ouvertes',
    [FEATURE_KEYS.ISSUES]: 'Tickets ouverts',
    [FEATURE_KEYS.OVERDUE]: 'Éléments en retard',
    [FEATURE_KEYS.SPRINT_PROGRESS]: 'Avancement du sprint',
    [FEATURE_KEYS.SPRINT_DAYS_LEFT]: 'Jours restants du sprint',
    [FEATURE_KEYS.SPRINT]: 'Sprint en cours',
  },
  de: {
    [FEATURE_KEYS.REACHABLE]: 'Erreichbar',
    [FEATURE_KEYS.USER_STORIES]: 'Offene User Stories',
    [FEATURE_KEYS.TASKS]: 'Offene Aufgaben',
    [FEATURE_KEYS.ISSUES]: 'Offene Tickets',
    [FEATURE_KEYS.OVERDUE]: 'Überfällige Elemente',
    [FEATURE_KEYS.SPRINT_PROGRESS]: 'Sprint-Fortschritt',
    [FEATURE_KEYS.SPRINT_DAYS_LEFT]: 'Verbleibende Sprint-Tage',
    [FEATURE_KEYS.SPRINT]: 'Aktueller Sprint',
  },
  es: {
    [FEATURE_KEYS.REACHABLE]: 'Accesible',
    [FEATURE_KEYS.USER_STORIES]: 'Historias de usuario abiertas',
    [FEATURE_KEYS.TASKS]: 'Tareas abiertas',
    [FEATURE_KEYS.ISSUES]: 'Peticiones abiertas',
    [FEATURE_KEYS.OVERDUE]: 'Elementos atrasados',
    [FEATURE_KEYS.SPRINT_PROGRESS]: 'Progreso del sprint',
    [FEATURE_KEYS.SPRINT_DAYS_LEFT]: 'Días restantes del sprint',
    [FEATURE_KEYS.SPRINT]: 'Sprint en curso',
  },
};

// Published on "current sprint" when none is in progress (a text state is never empty).
export const NO_SPRINT = { en: 'None', fr: 'Aucun', de: 'Keiner', es: 'Ninguno' };

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10000;
const DAYS_MAX = 365;
const TEXT_MAX_LENGTH = 100;

const COUNTER = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: COUNTER_MAX,
};

const PERCENT = { ...COUNTER, unit: DEVICE_FEATURE_UNITS.PERCENT, max: 100 };

const DAYS = {
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.DAYS,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: DAYS_MAX,
};

const TEXT = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  // NOT NULL in the core, even for a text (422 on "Add to Gladys" otherwise).
  min: 0,
  max: 0,
};

const REACHABLE = {
  category: DEVICE_FEATURE_CATEGORIES.INPUT,
  type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: 1,
};

export const instanceIds = (gladys) => gladys.externalIds(INSTANCE_TYPE, 'instance-main');
export const projectIds = (gladys, projectId) =>
  gladys.externalIds(PROJECT_TYPE, `project-${projectId}`);

const namesOf = (language) => NAMES[language] ?? NAMES.en;

/** The instance device, named after its host. */
export function buildInstance(gladys, host, language = 'en') {
  const ids = instanceIds(gladys);
  return {
    name: `Taiga ${host}`.slice(0, 60),
    external_id: ids.device,
    should_poll: false,
    features: [
      {
        ...REACHABLE,
        name: namesOf(language).reachable,
        external_id: ids.feature(FEATURE_KEYS.REACHABLE),
      },
    ],
  };
}

/**
 * @param {object} gladys
 * @param {{ id: number, name: string }} project
 * @param {string} [language]
 */
export function buildProject(gladys, project, language = 'en') {
  const ids = projectIds(gladys, project.id);
  const names = namesOf(language);
  const feature = (base, key) => ({ ...base, name: names[key], external_id: ids.feature(key) });
  return {
    name: `Taiga ${project.name}`.slice(0, 60),
    external_id: ids.device,
    should_poll: false,
    features: [
      feature(COUNTER, FEATURE_KEYS.USER_STORIES),
      feature(COUNTER, FEATURE_KEYS.TASKS),
      feature(COUNTER, FEATURE_KEYS.ISSUES),
      feature(COUNTER, FEATURE_KEYS.OVERDUE),
      feature(PERCENT, FEATURE_KEYS.SPRINT_PROGRESS),
      feature(DAYS, FEATURE_KEYS.SPRINT_DAYS_LEFT),
      feature(TEXT, FEATURE_KEYS.SPRINT),
    ],
  };
}

/** The state of the instance device. */
export function instanceStates(gladys, reachable) {
  return [
    {
      device_feature_external_id: instanceIds(gladys).feature(FEATURE_KEYS.REACHABLE),
      state: reachable ? 1 : 0,
    },
  ];
}

/**
 * The states of every feature of a project device, in the `publishStates`
 * format: `state` for a number, `text` for a text.
 * @param {object} gladys
 * @param {{ id: number, sprint: object|null }} project
 * @param {ReturnType<import('./taiga/model.js').summarize>} summary
 * @param {{ language: string, daysLeft: number }} options
 */
export function projectStates(gladys, project, summary, { language, daysLeft }) {
  const ids = projectIds(gladys, project.id);
  const number = (key, value, max = COUNTER_MAX) => ({
    device_feature_external_id: ids.feature(key),
    state: Math.max(0, Math.min(max, value)),
  });
  const sprint = project.sprint;
  return [
    number(FEATURE_KEYS.USER_STORIES, summary.userStories),
    number(FEATURE_KEYS.TASKS, summary.tasks),
    number(FEATURE_KEYS.ISSUES, summary.issues),
    number(FEATURE_KEYS.OVERDUE, summary.overdue),
    number(FEATURE_KEYS.SPRINT_PROGRESS, sprint ? sprint.progress : 0, 100),
    number(FEATURE_KEYS.SPRINT_DAYS_LEFT, sprint ? daysLeft : 0, DAYS_MAX),
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.SPRINT),
      text: sprint ? sprint.name.slice(0, TEXT_MAX_LENGTH) : (NO_SPRINT[language] ?? NO_SPRINT.en),
    },
  ];
}
