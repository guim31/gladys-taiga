# Taiga

Bring your [Taiga](https://taiga.io) projects into Gladys: the open user
stories, tasks and issues, the overdue items, and where the sprint in
progress stands (progress and days left). A scene reacts when an item becomes
overdue or when a new issue is opened, another one opens an issue or adds a
user story to the backlog, and a widget shows it all on the dashboard.

> **Feedback welcome.** This integration was tested against a real Taiga
> server (Docker image `taigaio/taiga-back` of 22 November 2026, with
> PostgreSQL 16 and RabbitMQ 4), not yet in everyday use, and not against
> taiga.io. If something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-taiga/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **self-hosted Taiga** reachable from Gladys, or an account on
  **taiga.io** (the cloud offer uses the same API; not tested).
- The **username** (or e-mail) and **password** of a Taiga user who is a
  member of the projects to follow. It must be a **password account**: a user
  who logs in through GitHub, GitLab or LDAP cannot log in from Gladys. A
  dedicated user, added as a member of the projects, is a good idea.

The integration sees the projects this user is a member of, and acts **as
this user**: the issues and user stories created from Gladys show them as
their author. A member whose role may not add issues or user stories can
follow a project, but not create anything in it.

## Set up

1. In Gladys, **Integrations** → install **Taiga**.
2. In the **Configuration** screen, fill in:
   - **Address**: the address of Taiga as in the browser, for example
     `http://192.168.1.20:9000`, or `https://taiga.example.org` behind a
     reverse proxy (a path prefix such as `/taiga` is kept). For taiga.io,
     `https://tree.taiga.io`;
   - **Username or e-mail** and **Password**.
3. Options:
   - **Followed projects**: names or slugs (the name in the address of the
     project) separated by commas. Empty: every project of the user, 20 at
     most;
   - **Accept self-signed certificates**: for an `https://` address with a
     self-signed certificate, on your own server only;
   - **Refresh interval**: 1 to 10 minutes (5 by default). Midnight, when
     items become overdue, is always followed on time;
   - **Language of the feature names**: the names given to the features when
     a device is added (French by default).
4. Save, then **Test the connection**: it reads Taiga and gives the number of
   open and overdue items, and of followed projects.
5. In the **Discovery** tab, add the devices you want.

## Devices

**Taiga _address_**, the instance, with one feature: `Reachable` (1 when
Taiga answers, 0 otherwise).

**Taiga _project_** for each followed project:

| Feature             | What it says                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `Open user stories` | the user stories whose status is not closed                             |
| `Open tasks`        | the tasks whose status is not closed                                    |
| `Open issues`       | the issues whose status is not closed (0 when the Issues module is off) |
| `Overdue items`     | open user stories, tasks and issues whose due date has passed           |
| `Sprint progress`   | % of the sprint in progress: closed points, else closed user stories    |
| `Sprint days left`  | days until the end date of the sprint (0 on its last day)               |
| `Current sprint`    | the name of the sprint in progress; `None` when there is none           |

An item is **overdue** once its due day has ended, in the time zone of Gladys,
while its status is not closed. The **sprint in progress** is the open sprint
whose start date is the latest one already reached. When Taiga does not
answer, the counters keep their last value and `Reachable` goes to 0.

## Dashboard

The **Taiga projects** widget shows three tiles (overdue, due today, open
issues) and a list of 8 rows at most: the sprints in progress with their
progress and days left, then the items overdue or due today, with their kind,
their number and their project. Choose a project device in the widget settings
to see only that project; leave it empty for every followed project. Untick
**Show the list of late items** to keep only the figures and the sprints. The
projects are named as in Gladys once their device is added.

The counters can also go on the dashboard as any device feature.

## Scenes

### Triggers

- **Taiga item overdue**: at midnight, an open user story, task or issue due
  that day is not closed. Once per item and due date. Filters: the project (a
  project device), the kind (user story, task, issue).
- **New Taiga issue**: an issue was created in a followed project. Filter: the
  project.

Information passed on to the actions: the title, the number (`#`), the kind,
the project, the status, the due date, and the link to the item in Taiga.

A new issue is seen at the next reading: within the refresh interval. A
project just added to the followed ones brings no "new issue", and an issue
created and closed between two readings is not seen, and a closed issue reopened is not new. After the integration was stopped for more than an hour, only the issues of the last hour are announced. A due date set to a day
already past fires nothing. A restart does not fire anything twice; an item
that became overdue less than an hour before the integration starts again
fires then.

### Actions

- **Create a Taiga issue**: a title, the project by name or slug (empty: the
  first followed project), an optional description. The issue gets the
  default type, priority and severity of the project.
- **Create a Taiga user story**: the same fields; the user story goes to the
  backlog of the project.

Results of both: the number (`#`), the id, the title, the project and the
link. A failure (project not found, Issues module off, missing permission,
Taiga not answering) is shown as an error. The fields accept scene variables:
`{{triggerEvent.data.item}}`.

### Scene ideas

- **Taiga item overdue**: send the title and the link on Telegram.
- **New Taiga issue** in the `Website` project: flash a light in the office.
- When the washing machine reports an error, **Create a Taiga issue**
  `Washing machine: error` in the `Home` project.
- A button by the door runs **Create a Taiga user story** `Fix the gate`.

## Troubleshooting

- **"Taiga does not answer"**: check the address and the port from the Gladys
  machine (the address opens Taiga in a browser).
- **"Username or password refused"**: the password changed, or the user logs
  in through GitHub, GitLab or LDAP: use a user with a password account.
- **"No Taiga API at this address"**: the address answers, but not with the
  Taiga API (`/api/v1`): check the port and the path prefix.
- **"The address redirects"**: enter the `https://` address.
- **"This user may not do this in the project"**: the role of the user in
  the project may not add issues or user stories.
- **A project is missing**: the user must be a member of the project; a name
  typed in **Followed projects** that matches no project is ignored, and
  **Test the connection** lists it. Beyond 20 projects, list the ones to
  follow.
- After a refused password, Taiga is tried again every 15 minutes at most, so as not to lock the account: correct the configuration to retry at once.
- Logs: `LOG_LEVEL=debug` on the container shows every reading.

## Limits

- Taiga is read every 1 to 10 minutes (and at midnight): a change in Taiga
  shows up in Gladys within that delay. Taiga's webhooks are not used.
- At each reading: the list of projects, then for each followed project its
  open user stories, tasks, issues and sprints (four requests, plus the list of projects). On taiga.io,
  keep a long interval: the service limits the number of requests.
- The login is kept in memory and renewed with Taiga's refresh token when it
  expires (after 24 hours on a default server); the password is only sent
  again when Taiga refuses both.
- The integration creates issues and user stories; it does not edit, close,
  assign or delete anything, and does not read epics, wiki pages or comments.
- Gladys keeps no Taiga data beyond `/data/taiga-state.json` (the time of the
  last reading and the last issue number seen in each project, so that no
  event fires twice).
- Not affiliated with Taiga or Kaleidos.
