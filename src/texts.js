// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors and results. Four languages, the four of the Gladys interface;
// German says "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './taiga/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Taiga in the configuration.',
    fr: "Saisissez l'adresse de votre Taiga dans la configuration.",
    de: 'Gib die Adresse deines Taiga in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Taiga en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:9000',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:9000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:9000',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:9000',
  },
  noCredentials: {
    en: 'Enter the username and password of a Taiga user in the configuration.',
    fr: "Saisissez l'identifiant et le mot de passe d'un utilisateur de Taiga dans la configuration.",
    de: 'Gib in der Konfiguration Benutzername und Passwort eines Taiga-Benutzers ein.',
    es: 'Introduzca el usuario y la contraseña de un usuario de Taiga en la configuración.',
  },
};

// One short explanation per error kind (src/taiga/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Taiga does not answer',
    fr: 'Taiga ne répond pas',
    de: 'Taiga antwortet nicht',
    es: 'Taiga no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'username or password refused (a password account, not GitHub or LDAP?)',
    fr: 'identifiant ou mot de passe refusé (un compte à mot de passe, pas GitHub ni LDAP ?)',
    de: 'Benutzername oder Passwort abgelehnt (ein Passwortkonto, nicht GitHub oder LDAP?)',
    es: 'usuario o contraseña rechazados (¿una cuenta con contraseña, no GitHub ni LDAP?)',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'this user may not do this in the project (role without this permission?)',
    fr: "cet utilisateur n'a pas ce droit dans le projet (rôle sans cette permission ?)",
    de: 'dieser Benutzer darf das im Projekt nicht (Rolle ohne diese Berechtigung?)',
    es: 'este usuario no tiene este permiso en el proyecto (¿rol sin este permiso?)',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'project not found',
    fr: 'projet introuvable',
    de: 'Projekt nicht gefunden',
    es: 'proyecto no encontrado',
  },
  [ERROR_KINDS.NOT_TAIGA]: {
    en: 'no Taiga API at this address (/api/v1)',
    fr: 'aucune API Taiga à cette adresse (/api/v1)',
    de: 'keine Taiga-API unter dieser Adresse (/api/v1)',
    es: 'no hay ninguna API de Taiga en esta dirección (/api/v1)',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, retrying later',
    fr: 'trop de requêtes, nouvel essai plus tard',
    de: 'zu viele Anfragen, neuer Versuch später',
    es: 'demasiadas solicitudes, se reintentará más tarde',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (items, overdue, projects) =>
      `Taiga OK: ${items} open item(s), ${overdue} overdue, in ${projects} followed project(s).`,
    failed: (reason) => `Taiga: ${reason}.`,
  },
  fr: {
    ok: (items, overdue, projects) =>
      `Taiga OK : ${items} élément(s) ouvert(s), ${overdue} en retard, dans ${projects} projet(s) suivi(s).`,
    failed: (reason) => `Taiga : ${reason}.`,
  },
  de: {
    ok: (items, overdue, projects) =>
      `Taiga OK: ${items} offene(s) Element(e), ${overdue} überfällig, in ${projects} verfolgten Projekt(en).`,
    failed: (reason) => `Taiga: ${reason}.`,
  },
  es: {
    ok: (items, overdue, projects) =>
      `Taiga OK: ${items} elemento(s) abierto(s), ${overdue} atrasado(s), en ${projects} proyecto(s) seguido(s).`,
    failed: (reason) => `Taiga: ${reason}.`,
  },
};

// Logged and shown when a project typed in the configuration does not exist.
export const UNKNOWN_PROJECTS = {
  en: (names) => `Unknown project(s) ignored: ${names}.`,
  fr: (names) => `Projet(s) inconnu(s) ignoré(s) : ${names}.`,
  de: (names) => `Unbekannte(s) Projekt(e) ignoriert: ${names}.`,
  es: (names) => `Proyecto(s) desconocido(s) ignorado(s): ${names}.`,
};

// Errors of the scene actions (shown in red in Gladys).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Taiga is not configured.',
    fr: "Taiga n'est pas configuré.",
    de: 'Taiga ist nicht konfiguriert.',
    es: 'Taiga no está configurado.',
  },
  emptyTitle: {
    en: 'Give the title of the new item.',
    fr: 'Indiquez le titre du nouvel élément.',
    de: 'Gib den Titel des neuen Elements an.',
    es: 'Indique el título del nuevo elemento.',
  },
  noProject: {
    en: 'This Taiga user is a member of no project.',
    fr: "Cet utilisateur de Taiga n'est membre d'aucun projet.",
    de: 'Dieser Taiga-Benutzer ist Mitglied keines Projekts.',
    es: 'Este usuario de Taiga no es miembro de ningún proyecto.',
  },
  projectNotFound: {
    en: 'No project of this user has this name, slug or id in Taiga.',
    fr: 'Aucun projet de cet utilisateur ne porte ce nom, ce slug ou cet identifiant dans Taiga.',
    de: 'Kein Projekt dieses Benutzers hat in Taiga diesen Namen, Slug oder diese ID.',
    es: 'Ningún proyecto de este usuario tiene este nombre, slug o identificador en Taiga.',
  },
  projectAmbiguous: {
    en: 'Several projects have this name: give its slug (in its address) instead.',
    fr: 'Plusieurs projets portent ce nom : indiquez plutôt son slug (dans son adresse).',
    de: 'Mehrere Projekte haben diesen Namen: Gib stattdessen seinen Slug an (in seiner Adresse).',
    es: 'Varios proyectos tienen este nombre: indique su slug (en su dirección).',
  },
  issuesOff: {
    en: 'The Issues module is turned off in this project.',
    fr: 'Le module Tickets est désactivé dans ce projet.',
    de: 'Das Modul Tickets ist in diesem Projekt deaktiviert.',
    es: 'El módulo Peticiones está desactivado en este proyecto.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A multi-language object from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(Object.keys(INIT_FAILED).map((language) => [language, render(language)]));
