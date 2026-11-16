# Changelog

## 1.0.0 — 2026-11-16

Initial release.

- Skills section at the top of the composer `+` menu: only skills enabled in
  the manager are listed; choosing one inserts `/skill-name ` into the draft
  without sending it.
- Manager panel (opened from the "Manage skills" row): search, enable/disable
  toggles, delete with confirmation (user-defined and workspace skills only;
  files move to `~/.dsh/skill-menu-trash/`), and batch enable/disable.
- Import a skill folder from the local disk through the system folder picker;
  it is copied into `~/.dsh/skills/` and opened in the manager.
- Built-in skills can be disabled but not deleted. The typed `/` skill menu is
  untouched, so no duplicate skills list ever appears. Subagent composers are
  excluded: browsing them never queries the skill catalog.
- Enable/disable state is stored in browser localStorage and survives
  restarts.
