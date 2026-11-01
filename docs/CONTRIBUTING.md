# Contributing to IKEAR

Thank you for your interest in contributing to **IKEAR**. This guide explains our development workflow, coding conventions, testing standards, and pull request procedures.

---

## 1. Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for all contributors. Treat everyone with respect and empathy.

---

## 2. Development Setup

### Prerequisites

*   **Node.js:** v18.0.0 or higher (v20+ LTS recommended)
*   **npm:** v9.0.0 or higher
*   **Expo CLI:** Installed globally or run via `npx expo`
*   **Git:** v2.30 or higher

### Getting Started

1.  Fork and clone the repository:
    ```bash
    git clone https://github.com/HairuoLiu/ikear.git
    cd ikear
    ```

2.  Install project dependencies:
    ```bash
    npm install
    ```

3.  Verify your local environment by running tests:
    ```bash
    npm test
    ```
    All 253 unit and integration tests should pass without errors.

---

## 3. Development Workflow

### Branching Strategy

*   Create feature branches from `main`.
*   Use standard semantic branch names:
    *   `feat/feature-name`: New features or enhancements.
    *   `fix/bug-description`: Bug fixes.
    *   `docs/documentation-update`: Documentation additions or revisions.
    *   `refactor/component-name`: Code refactoring without behavior changes.

### Running the Local Dev Server

*   **Web Development (Recommended for rapid iteration):**
    ```bash
    npx expo start --web
    ```
    This launches the application at `http://localhost:19006` or `http://localhost:8081`.

*   **Mobile Development (iOS Simulator / Android Emulator):**
    ```bash
    npx expo start --ios      # Launches iOS Simulator
    npx expo start --android  # Launches Android Emulator
    ```

---

## 4. Coding Standards

Follow these conventions when writing code for IKEAR:

### TypeScript & Types

*   Write all new code in strict TypeScript.
*   Do not use `any` unless interacting with untyped third-party libraries; use `unknown` with type guards instead.
*   All domain models must reside in `src/data/types.ts`. Do not define ad-hoc interfaces in UI screens.

### Design System & Styling

*   Import colors, spacing, radius, and typography exclusively from `src/theme/tokens.ts`:
    ```typescript
    import { colors, radius, spacing, typography } from '../theme/tokens';
    ```
*   Do not hardcode hex color values in component styles.
*   Adhere to the single-task-per-screen rule (一屏一任务). Use one primary button per screen (`PrimaryButton`).

### Platform Code Separation

*   When implementing platform-specific behavior, create side-by-side files:
    *   `feature.native.ts` (for iOS and Android)
    *   `feature.ts` (for Web and headless environments)
*   Never bundle native-only packages (e.g., `expo-local-authentication`) into web bundles without a platform extension guard.

---

## 5. Testing Requirements

Every pull request must include relevant test coverage.

### Running Test Suites

*   **Run all unit and integration tests:**
    ```bash
    npm test
    ```
*   **Run standalone E2E journeys:**
    ```bash
    npm run e2e
    ```

### Writing Tests

*   Place unit tests adjacent to the implementation file: `filename.test.ts`.
*   Tests run using Node's native test runner (`node:test` and `node:assert/strict`).
*   Ensure business logic is written as pure, platform-agnostic functions in `src/lib` or `src/data`.

---

## 6. Pull Request Checklist

Before submitting your pull request, verify each of the following:

- [ ] Code compiles cleanly without TypeScript errors.
- [ ] `npm test` runs and all 253+ test cases pass.
- [ ] New components adhere to the design system in `docs/DESIGN_SYSTEM.md`.
- [ ] Commit messages follow the Conventional Commits specification (e.g., `feat(cards): enhance listing card typography`).
- [ ] Documentation has been updated to reflect any API or schema changes.
