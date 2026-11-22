// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `project_overview`.
//
// The use case: the office screen shows what is late and where the sprint
// stands, without opening Taiga. For every followed project, or for one (a
// project device chosen in the widget settings).
//
// Budget (8 components, 2 texts, one status list): three tiles (overdue, due
// today, open issues), one status list of 8 rows at most: the sprints in
// progress (progress and days left), then the items overdue or due today
// (hidden by a setting), and a sentence when nothing is late. The figures are
// values, not bound to device features, so the widget works before any
// device is added. Read-only: no button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { KINDS } from './taiga/model.js';
import { pick } from './texts.js';

const MAX_ROWS = 8;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Taiga, a username and a password in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Taiga, un identifiant et un mot de passe dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Taiga, einen Benutzernamen und ein Passwort in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Taiga, un usuario y una contraseña en la configuración de la integración.',
  },
  unknown: {
    en: 'This project is no longer followed: choose another device in the widget settings.',
    fr: "Ce projet n'est plus suivi : choisissez un autre appareil dans les réglages du widget.",
    de: 'Dieses Projekt wird nicht mehr verfolgt: Wähle ein anderes Gerät in den Widget-Einstellungen.',
    es: 'Este proyecto ya no se sigue: elija otro dispositivo en la configuración del widget.',
  },
  noAnswer: {
    en: 'Taiga does not answer: see the Configuration screen of the integration.',
    fr: "Taiga ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'Taiga antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'Taiga no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'Taiga does not answer: last known figures.',
    fr: 'Taiga ne répond pas : derniers chiffres connus.',
    de: 'Taiga antwortet nicht: zuletzt bekannte Zahlen.',
    es: 'Taiga no responde: últimas cifras conocidas.',
  },
  nothing: {
    en: 'Nothing overdue or due today.',
    fr: "Rien en retard ni pour aujourd'hui.",
    de: 'Nichts überfällig oder heute fällig.',
    es: 'Nada atrasado ni para hoy.',
  },
  overdue: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasados' },
  dueToday: { en: 'Due today', fr: "Aujourd'hui", de: 'Heute fällig', es: 'Para hoy' },
  issues: { en: 'Open issues', fr: 'Tickets ouverts', de: 'Offene Tickets', es: 'Peticiones' },
  daysLeft: {
    en: (days) => `${days} d left`,
    fr: (days) => `${days} j restant${days > 1 ? 's' : ''}`,
    de: (days) => `noch ${days} T.`,
    es: (days) => `${days} d restantes`,
  },
  late: { en: 'late', fr: 'en retard', de: 'überfällig', es: 'atrasado' },
  today: { en: 'today', fr: "aujourd'hui", de: 'heute', es: 'hoy' },
  kinds: {
    [KINDS.USER_STORY]: { en: 'Story', fr: 'Story', de: 'Story', es: 'Historia' },
    [KINDS.TASK]: { en: 'Task', fr: 'Tâche', de: 'Aufgabe', es: 'Tarea' },
    [KINDS.ISSUE]: { en: 'Issue', fr: 'Ticket', de: 'Ticket', es: 'Petición' },
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The status row of a sprint: its name (and project), progress and days left. */
function sprintRow(hub, project, { showProject, language }) {
  const { sprint } = project;
  const label = showProject ? `${hub.shownProjectName(project.id)} · ${sprint.name}` : sprint.name;
  const days = hub.daysLeft(sprint);
  return {
    label: fit(label, 40),
    icon: 'flag',
    value: fit(`${sprint.progress} % · ${t(TEXT.daysLeft, language)(days)}`, 40),
    color:
      sprint.progress >= 100
        ? WIDGET_COLORS.SUCCESS
        : days === 0
          ? WIDGET_COLORS.WARNING
          : WIDGET_COLORS.NEUTRAL,
  };
}

/** The status row of an item: its kind and ref, late or today, and its project. */
function itemRow(hub, item, { today, showProject, language }) {
  const late = item.due < today;
  const where = [
    `${t(TEXT.kinds[item.kind], language)} #${item.ref ?? item.id}`,
    late ? t(TEXT.late, language) : t(TEXT.today, language),
    showProject ? hub.shownProjectName(item.projectId) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    label: fit(item.name, 40),
    icon: late ? 'alert-circle' : 'clock',
    value: fit(where, 40),
    color: late ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
  };
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.readAt === 0) {
    return message(TEXT.noAnswer, language);
  }
  const { project, unknown } = hub.view(settings?.device || null);
  if (unknown) {
    return message(TEXT.unknown, language);
  }
  const projects = project ? [project] : hub.followed;
  const showProject = !project && hub.followed.length > 1;
  const today = hub.today();
  const summary = hub.summary(project);
  const components = [];
  if (hub.error) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.stale, language) });
  }
  components.push(
    {
      type: 'value',
      value: summary.overdue,
      label: t(TEXT.overdue, language),
      icon: 'alert-circle',
      color: summary.overdue > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
    { type: 'value', value: summary.dueToday, label: t(TEXT.dueToday, language), icon: 'calendar' },
    {
      type: 'value',
      value: summary.issues,
      label: t(TEXT.issues, language),
      icon: 'alert-triangle',
    },
  );
  // The core keeps one status list per widget: the sprints first, then the items.
  const rows = projects
    .filter((item) => item.sprint)
    .map((item) => sprintRow(hub, item, { showProject, language }));
  if (settings?.show_items !== false) {
    rows.push(
      ...summary.agenda.map((item) => itemRow(hub, item, { today, showProject, language })),
    );
  }
  if (rows.length > 0) {
    components.push({ type: 'status', items: rows.slice(0, MAX_ROWS) });
  }
  if (summary.agenda.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothing, language) });
  }
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
