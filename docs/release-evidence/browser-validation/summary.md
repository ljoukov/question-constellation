# Real-Chrome release validation

- Status: **passed**
- Run: 2026-07-16T23:44:13.034Z to 2026-07-16T23:45:34.544Z
- Origin: `http://127.0.0.1:5173/`
- Chrome: `Chrome/149.0.7827.155`
- Cases: 24/24 passed
- Page errors: 0
- Document overflow cases: 0
- Intentional horizontal-scroll regions: 4

| Viewport | Theme | Route              | Status | HTTP | Errors | Document overflow | Protrusions | Screenshot                                                |
| -------- | ----- | ------------------ | ------ | ---: | -----: | ----------------- | ----------: | --------------------------------------------------------- |
| mobile   | light | home               | passed |  200 |      0 | no                |           0 | [view](screenshots/home--mobile--light.jpg)               |
| mobile   | light | english-literature | passed |  200 |      0 | no                |           0 | [view](screenshots/english-literature--mobile--light.jpg) |
| mobile   | light | english-practice   | passed |  200 |      0 | no                |           0 | [view](screenshots/english-practice--mobile--light.jpg)   |
| mobile   | light | physics            | passed |  200 |      0 | no                |           0 | [view](screenshots/physics--mobile--light.jpg)            |
| mobile   | dark  | home               | passed |  200 |      0 | no                |           0 | [view](screenshots/home--mobile--dark.jpg)                |
| mobile   | dark  | english-literature | passed |  200 |      0 | no                |           0 | [view](screenshots/english-literature--mobile--dark.jpg)  |
| mobile   | dark  | english-practice   | passed |  200 |      0 | no                |           0 | [view](screenshots/english-practice--mobile--dark.jpg)    |
| mobile   | dark  | physics            | passed |  200 |      0 | no                |           0 | [view](screenshots/physics--mobile--dark.jpg)             |
| ipad     | light | home               | passed |  200 |      0 | no                |           0 | [view](screenshots/home--ipad--light.jpg)                 |
| ipad     | light | english-literature | passed |  200 |      0 | no                |           0 | [view](screenshots/english-literature--ipad--light.jpg)   |
| ipad     | light | english-practice   | passed |  200 |      0 | no                |           0 | [view](screenshots/english-practice--ipad--light.jpg)     |
| ipad     | light | physics            | passed |  200 |      0 | no                |           0 | [view](screenshots/physics--ipad--light.jpg)              |
| ipad     | dark  | home               | passed |  200 |      0 | no                |           0 | [view](screenshots/home--ipad--dark.jpg)                  |
| ipad     | dark  | english-literature | passed |  200 |      0 | no                |           0 | [view](screenshots/english-literature--ipad--dark.jpg)    |
| ipad     | dark  | english-practice   | passed |  200 |      0 | no                |           0 | [view](screenshots/english-practice--ipad--dark.jpg)      |
| ipad     | dark  | physics            | passed |  200 |      0 | no                |           0 | [view](screenshots/physics--ipad--dark.jpg)               |
| laptop   | light | home               | passed |  200 |      0 | no                |           0 | [view](screenshots/home--laptop--light.jpg)               |
| laptop   | light | english-literature | passed |  200 |      0 | no                |           0 | [view](screenshots/english-literature--laptop--light.jpg) |
| laptop   | light | english-practice   | passed |  200 |      0 | no                |           0 | [view](screenshots/english-practice--laptop--light.jpg)   |
| laptop   | light | physics            | passed |  200 |      0 | no                |           0 | [view](screenshots/physics--laptop--light.jpg)            |
| laptop   | dark  | home               | passed |  200 |      0 | no                |           0 | [view](screenshots/home--laptop--dark.jpg)                |
| laptop   | dark  | english-literature | passed |  200 |      0 | no                |           0 | [view](screenshots/english-literature--laptop--dark.jpg)  |
| laptop   | dark  | english-practice   | passed |  200 |      0 | no                |           0 | [view](screenshots/english-practice--laptop--dark.jpg)    |
| laptop   | dark  | physics            | passed |  200 |      0 | no                |           0 | [view](screenshots/physics--laptop--dark.jpg)             |

The machine-readable DOM summaries, console/page errors, response failures, clipping candidates,
and horizontal-scroll regions are in [report.json](report.json). Candidate lists are evidence for
manual review; only document-level horizontal overflow is an automatic failure.
