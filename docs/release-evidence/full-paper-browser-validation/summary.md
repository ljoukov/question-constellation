# Full-paper real-Chrome acceptance

- Status: **passed**
- Approved sitting: `aqa-8464p2h-jun24`
- Approved cases: 6/6
- Approved-paper grade requests: **0**
- Control refusal passed: **yes**
- Approved-paper submission or model grading: **not performed**

| Viewport | Theme | Status | Failed assertions | Grade requests | Document overflow | Start                                         | In progress                                               |
| -------- | ----- | ------ | ----------------: | -------------: | ----------------- | --------------------------------------------- | --------------------------------------------------------- |
| mobile   | light | passed |                 0 |              0 | no                | [start](screenshots/start--mobile--light.jpg) | [in progress](screenshots/in-progress--mobile--light.jpg) |
| mobile   | dark  | passed |                 0 |              0 | no                | [start](screenshots/start--mobile--dark.jpg)  | [in progress](screenshots/in-progress--mobile--dark.jpg)  |
| ipad     | light | passed |                 0 |              0 | no                | [start](screenshots/start--ipad--light.jpg)   | [in progress](screenshots/in-progress--ipad--light.jpg)   |
| ipad     | dark  | passed |                 0 |              0 | no                | [start](screenshots/start--ipad--dark.jpg)    | [in progress](screenshots/in-progress--ipad--dark.jpg)    |
| laptop   | light | passed |                 0 |              0 | no                | [start](screenshots/start--laptop--light.jpg) | [in progress](screenshots/in-progress--laptop--light.jpg) |
| laptop   | dark  | passed |                 0 |              0 | no                | [start](screenshots/start--laptop--dark.jpg)  | [in progress](screenshots/in-progress--laptop--dark.jpg)  |

The detailed laptop/light case covers blank confirmation cancellation, ordinary caret typing,
fixed response persistence, the 5,000-character guard, copy/cut/paste/drop/beforeinput blocking,
selection policy, part-focus timing, and reload/resume wall-clock behavior. The control uses the
incomplete Combined Physics Paper 1 catalog entry, confirms that no online sitting is advertised,
checks that its renderer route is absent, sends one fail-closed sitting request, and verifies zero
attempt/evidence rows for that unique session. See [report.json](report.json) for exact evidence.
