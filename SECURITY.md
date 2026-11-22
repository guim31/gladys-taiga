# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **password** of a Taiga user, stored by Gladys in the integration's
  configuration and sent only to the configured Taiga address (`POST
/api/v1/auth`);
- the **access and refresh tokens** Taiga gives back, kept in memory only,
  never written to disk nor logged;
- `/data/taiga-state.json`: the time of the last reading and the last issue
  id seen in each project, nothing else;
- network: HTTP(S) requests to the configured Taiga address only (or
  `api.taiga.io` for taiga.io). "Accept self-signed certificates" turns off
  certificate checking for that address only.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Taiga and the other third-party services the integration talks to.
