# Taiga for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings your [Taiga](https://taiga.io) projects into Gladys: open user
stories, tasks and issues, overdue items, the sprint in progress, scene
triggers, scene actions and a dashboard widget.

> **Feedback welcome.** Tested against a real Taiga server in Docker
> (`taigaio/taiga-back` of 22 November 2026), not yet in everyday use, and not
> against taiga.io. Please report what does not work in the
> [issues](https://github.com/guim31/gladys-taiga/issues).

## Features

- **One device for the instance** (`Reachable`) and **one per followed
  project**: open user stories, open tasks, open issues, overdue items,
  sprint progress (%), sprint days left, current sprint.
- **Scene triggers**: an item (user story, task or issue) becomes overdue at
  midnight; a new issue is opened.
- **Scene actions**: create an issue, create a user story (with their number
  and link as results).
- **Widget** "Taiga projects": overdue, due today and open issues, the sprints
  in progress, the late items.
- Four languages (English, French, German, Spanish).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A self-hosted Taiga reachable from Gladys, or a taiga.io account (same API,
  not tested).
- The username (or e-mail) and password of a Taiga user with a password
  account (not GitHub, GitLab or LDAP), member of the projects to follow.

## Installation

In Gladys, **Integrations → Install from GitHub**, with the address
`https://github.com/guim31/gladys-taiga`. Then fill in the address of Taiga,
the username and the password in the **Configuration** screen, and add the
devices in **Discovery**. The full documentation is in [`docs/`](docs/en.md)
(English, French, German, Spanish).

## How it works

The integration reads the Taiga REST API (`/api/v1`) on its own timer (1 to 10
minutes, and at local midnight): the projects of the user, then for each
followed project its open user stories, tasks, issues and sprints. The devices
are published with `should_poll: false`, and only the values that change are
sent to Gladys. The login (`POST /auth`) is kept in memory and renewed with the
refresh token when the access token expires. `/data/taiga-state.json` keeps
the time of the last reading and the last issue id seen in each project, so a
restart neither repeats nor loses a scene event.

## Checked on a real Taiga, and what was not

Checked against `taigaio/taiga-back` (with PostgreSQL 16 and RabbitMQ 4) in
Docker, from the integration's own image locked like the Gladys sandbox
(read-only, no capability, 256 MB): login by username and by e-mail, the
projects, user stories, tasks, issues and sprints, the creation of issues and
user stories, a wrong password, an expired access token renewed by the refresh
token, a used refresh token (new login), an unreachable server, a wrong
address, and the whole integration against the fake Gladys of the SDK. The
fixtures of the tests are real answers of that server, anonymized.

Not checked: taiga.io (no account), a Taiga behind a reverse proxy with a path
prefix or a self-signed certificate, and a real Gladys instance.

## Limitations

- Changes in Taiga show up within the refresh interval; webhooks are not used.
- Creates issues and user stories only: nothing is edited, closed or deleted.
- 20 followed projects at most.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Taiga (`test/helpers/fakeTaiga.js`) built from real answers.
See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Taiga](https://github.com/kaleidos-ventures) by Kaleidos and its
  contributors (taiga-back MPL-2.0, taiga-front AGPL-3.0): the integration
  only talks to its API; no code was copied. The cover uses the official Taiga
  logo shipped with the web app (`taiga-front/app/svg/logo-color.svg`), to
  name the service.
- The architecture, the scene events and the conformity tests follow
  [gladys-wekan](https://github.com/guim31/gladys-wekan).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Taiga or
Kaleidos. The Taiga name and logo belong to their owners.

## License

Apache-2.0
