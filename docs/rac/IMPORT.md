# RAC import record

Source: `~/Downloads/BacklogMD-Remote-Agent-Control-macOS.zip`.

ZIP SHA-256: `3067dcde757521723d05ba9929aa893d7757cbc0c5f4203c8226ff4f380cb36f`.

Unpacked outside the repository under `/tmp/backlog-rac-setup.NlrkPR/`.
`import/roadmap.json` preserves the 28 original task definitions (only JSON formatting changed); `PACKAGE-README.md` and `PACKAGE-ARCHITECTURE.md` preserve the supplied context. They are historical inputs, not overrides of the researched architecture and project instructions.

The maintained importer uses Bun plus this fork's `src/cli.ts` rather than the global `backlog` executable. Changes from the supplied importer:

- Actual CLI reads and all task-list pages during dry-run; duplicate RAC-prefix and dependency-cycle checks before writes.
- RAC-01 describes verification of the already existing fork.
- Original package plans are saved through a separate CLI edit after task creation. Future-task plans are preserved at the user's explicit request, not considered approved implementation designs.
- Dependency edits send all existing plus missing dependencies, preserving unrelated edges because `--dep` replaces the field.
- Re-running imports preserves existing task content and maps keys to actual CLI-allocated IDs.

Descriptions, priorities, labels, acceptance criteria, plans and dependency sets were compared using `task view --json` for every created task before RAC-01 was updated with its researched plan. Optional milestone import was not used or validated; phase labels retain the supplied grouping. All tasks were initially To Do; only RAC-01 was subsequently activated for this setup.

| Roadmap key | Allocated ID | Direct dependencies | Criteria |
| --- | --- | --- | --- |
| RAC-01 | BACK-790 | — | 4 |
| RAC-02 | BACK-791 | BACK-790 | 6 |
| RAC-03 | BACK-792 | BACK-790, BACK-791 | 5 |
| RAC-04 | BACK-793 | BACK-791, BACK-792 | 4 |
| RAC-05 | BACK-794 | BACK-791, BACK-793 | 4 |
| RAC-06 | BACK-795 | BACK-792, BACK-793, BACK-794 | 6 |
| RAC-07 | BACK-796 | BACK-793, BACK-794 | 5 |
| RAC-08 | BACK-797 | BACK-794, BACK-795, BACK-796 | 5 |
| RAC-09 | BACK-798 | BACK-795, BACK-796, BACK-797 | 5 |
| RAC-10 | BACK-799 | BACK-796, BACK-797, BACK-798 | 5 |
| RAC-11 | BACK-800 | BACK-797, BACK-798 | 5 |
| RAC-12 | BACK-801 | BACK-798, BACK-799, BACK-800 | 5 |
| RAC-13 | BACK-802 | BACK-792, BACK-796, BACK-798, BACK-799 | 5 |
| RAC-14 | BACK-803 | BACK-802 | 5 |
| RAC-15 | BACK-804 | BACK-801, BACK-802, BACK-803 | 5 |
| RAC-16 | BACK-805 | BACK-802, BACK-803, BACK-804 | 5 |
| RAC-17 | BACK-806 | BACK-800, BACK-801, BACK-804, BACK-805 | 5 |
| RAC-18 | BACK-807 | BACK-791, BACK-797, BACK-803, BACK-805 | 5 |
| RAC-19 | BACK-808 | BACK-807 | 5 |
| RAC-20 | BACK-809 | BACK-799, BACK-807, BACK-808 | 6 |
| RAC-21 | BACK-810 | BACK-806, BACK-807, BACK-808, BACK-809 | 6 |
| RAC-22 | BACK-811 | BACK-797, BACK-799, BACK-810 | 5 |
| RAC-23 | BACK-812 | BACK-799, BACK-811 | 5 |
| RAC-24 | BACK-813 | BACK-806, BACK-811 | 5 |
| RAC-25 | BACK-814 | BACK-802, BACK-807, BACK-810 | 5 |
| RAC-26 | BACK-815 | BACK-806, BACK-811, BACK-812 | 5 |
| RAC-27 | BACK-816 | BACK-810, BACK-811, BACK-812, BACK-813 | 5 |
| RAC-28 | BACK-817 | BACK-809, BACK-810, BACK-813, BACK-816 | 6 |
