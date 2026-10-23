# Project rules

- Keep title fields separate. Never infer an original title, language support, patch version,
  achievement compatibility or emulator choice from a localized display name.
- An original game, a translation/mod project, a release and a ROM fingerprint are distinct.
  Keep inherited base-game metadata links separate from direct identity links.
- Record source and revision. Preserve source licenses and attribution. Provider credentials,
  inventories, account/session data, absolute library paths and media/ROM payloads stay out.
- Importers read snapshots or upstream metadata only. Never run upstream installers, move,
  rename, patch or delete library files. No deployment or container restart.
- Arcade short names have a namespace. Never fuzzy-match an unknown set into a playable set.
- Use synthetic game names in tests. Scratch data belongs under ignored disk-backed artifacts.
- Work from origin/main in a separate worktree. Main is not a push target. Review once, address
  the review once, and run tests and lint before each branch push in the same command:
  `COOK_RETRO_AUTO_CORES=false COOK_RETRO_AUTO_ART=false npm run test:unit && npm run lint && git push ...`.
- Write code, commits and PR descriptions in English. Report to the user in Korean.
- Do not spawn agents except when explicitly authorized. A single read-only review is enough.
