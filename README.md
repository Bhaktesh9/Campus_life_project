# Campus Life — IST4035 Coursework Demo

This repository contains a small single-page Campus Life web app demonstrating HTML5, CSS3, and modern JavaScript (ES6+) features as required by IST4035 coursework.

Key features:
- Semantic HTML with ARIA and keyboard-friendly flows
- Responsive CSS (grid + flexbox), CSS variables, transitions
- ES6 modules and class-based store with localStorage persistence
- Async parallel fetch of mock APIs (data/*.json) with error handling
- Debounced search, optimistic booking flow, and Canvas calendar (dynamic import)
- Unit tests (Jest) and GitHub Actions CI

How to run locally (Windows PowerShell):

1. Install dev deps for tests:

```powershell
npm ci
```

2. Run tests:

```powershell
npm test
```

3. Serve files with a static server (or open index.html in a browser). Using live-server if installed:

```powershell
npx live-server --port=8080 --open=./index.html
```

Project layout and notes are included in the final report. See the `data/` folder for sample datasets. The Canvas calendar demonstrates the HTML5 Canvas API and is loaded dynamically to implement code-splitting.

Sanitization and ampersand policy
---------------------------------

User-provided text is sanitized before being inserted into the DOM to mitigate XSS.
- Implementation: `js/utils.js` → `sanitizeInput(str)` (escapes `&`, `<`, `>`, quotes, backticks).
- Tests: `tests/utils.test.js` verifies sanitizer behavior; additional booking tests are in `tests/booking.test.js`.

Policy used in this repository (assumption): leave visible `&` glyphs in static UI copy as-is in HTML source. Dynamic content that may include `&` is escaped by `sanitizeInput`. If you'd prefer to replace visible `&` with the word "and" or with the HTML entity `&amp;`, tell me and I will apply the change consistently across source files (excluding generated `coverage/`).

Test results (this workspace)
-----------------------------

All unit tests pass locally in this workspace (Jest, jsdom environment):

 - Test suites: 4 passed
 - Tests: 8 passed

Run the tests yourself with:

```powershell
npm ci
npm test
```
