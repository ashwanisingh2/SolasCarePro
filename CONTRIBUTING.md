# Contributing to SolasCarePro

We welcome contributions to make SolasCarePro better! Please review this document to understand our development flow and security requirements.

## Development Setup
1. Clone the repository and navigate to the project directory.
2. Ensure you have Node.js installed.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server (Vite + Electron):
   ```bash
   npm run dev
   ```
   Note: Some operations require the app to be run as Administrator on Windows. During development, you may need to open your terminal as Administrator.

## Important Scripts
- `npm run dev`: Starts the development server.
- `npm run test`: Runs the Vitest unit test suite.
- `npm run test:watch`: Runs Vitest in watch mode.
- `npm run test:e2e`: Runs Playwright End-to-End tests.
- `npm run build`: Compiles Vite assets and packages the Electron app.

## Pull Request Guidelines
- **Security First:** SolasCarePro executes powerful commands. DO NOT bypass the allowlist in `commandExecutor.js`. All new commands must define a clear, non-injectable `buildArgs` schema.
- **Pass All Tests:** Ensure `npm run test` passes locally. If you add a new command, you MUST add a test for it in `test/commandExecutor.test.js`.
- **UI/UX Consistency:** Follow the existing Tailwind and Framer Motion patterns. Use the `glass-panel` classes and the brand colors.

## Code Signing (For Maintainers)
For production builds, the app must be code-signed to avoid Windows SmartScreen warnings and allow seamless Administrator elevation.
To sign the app:
1. Obtain a valid Code Signing Certificate (EV or Standard).
2. Set up your environment variables for `electron-builder` (e.g., `CSC_LINK` and `CSC_KEY_PASSWORD`, or use a hardware token).
3. The `package.json` contains placeholders in the `build.win` section:
   - `certificateFile`
   - `certificateSubjectName`
   - `signingHashAlgorithms`
   Configure these according to your certificate provider's documentation. Do **NOT** commit private keys or certificates to the repository.
