# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-22

### Added

- Taiga projects in Gladys (self-hosted, or taiga.io with the same API): a
  device for the instance (reachable) and one per followed project, with its
  open user stories, tasks and issues, its overdue items, and the progress,
  days left and name of the sprint in progress.
- Scene triggers: an item becomes overdue (at midnight, filtered by project
  and kind), a new issue is opened.
- Scene actions: create an issue, create a user story; their number and link
  come back as results.
- Dashboard widget "Taiga projects": overdue items, items due today, open
  issues, sprints in progress, late items.
- Feature names, messages and documentation in English, French, German and
  Spanish.

[Unreleased]: https://github.com/guim31/gladys-taiga/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-taiga/releases/tag/v1.0.0
