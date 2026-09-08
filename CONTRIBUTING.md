# Contributing to Carrier

Thanks for your interest in contributing to Carrier! This document covers the basics you need to get started.

## Getting Started

Carrier is a single-file web app — there's no build step, no bundler, no `npm install`.

1. **Clone the repo**

   ```bash
   git clone https://github.com/saibighnesh/Carrier.git
   cd Carrier
   ```

2. **Open `index.html`** in any modern browser — that's it, the app is running.

3. **Edit `index.html`** directly. All HTML, CSS, and JavaScript live in one file by design.

## Running Tests

The test suite runs in Node.js (v18+):

```bash
node test/run.mjs
```

Individual test files can be run directly:

```bash
node test/dense.mjs
node test/pwscore.mjs
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix     | Use for                                |
|------------|----------------------------------------|
| `fix:`     | Bug fixes                              |
| `feat:`    | New features                           |
| `style:`   | CSS / visual-only changes              |
| `refactor:`| Code restructuring without behavior change |
| `test:`    | Adding or updating tests               |
| `docs:`    | Documentation changes                  |
| `chore:`   | Maintenance (CI, deps, config)         |

**Example:** `fix: guard unpack() against truncated encrypted body`

## Branch Naming

Use a prefix matching the commit type:

```
fix/short-description
feat/short-description
docs/short-description
test/short-description
style/short-description
```

## Pull Requests

1. Branch off `main`
2. Keep changes focused — one fix or feature per PR
3. Reference any related issue in the PR body (`Fixes #123`)
4. Make sure `node test/run.mjs` passes before opening

## Code Style

- **No external dependencies.** Carrier ships as a single self-contained HTML file.
- **Preserve existing comments.** Many inline comments explain non-obvious decisions — keep them unless the code they describe is changing.
- **Accessibility matters.** Every interactive element needs a label, a keyboard path, and a focus style.
- **Test what you change.** If you touch encoding, chunking, or crypto logic, add or update a test in `test/`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
