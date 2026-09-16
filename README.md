# Pixiverse site

Static scroll walkthrough for Pixiverse, deployed to https://pixiverse.app with GitHub Pages.

## Routes

- `/`: interactive village, five-second focus challenge, reward wheel, and friends.
- `/privacy/`: the existing game privacy policy, with updated presentation.
- `/credits/`: art and font acknowledgements.
- `/about/`: the existing About content, with shared presentation.
- `/privacy.html` and `/credits.html`: compatibility redirects.

Run `npm test` for the behavior and mobile viewport regression checks. Run `npm run dev` for a localhost preview. No dependency installation or application build is required.

Pushing `main` runs the tests and deploys an explicit public-file allowlist through GitHub Actions. Tests, documentation, Git metadata, and local preview tooling are excluded from the Pages artifact. Preserve `CNAME` and `.nojekyll`.

The Discord button opens the Pixiverse community invite. The walkthrough does not grant in-game rewards or connect to the game backend. Reduced-motion settings are respected. Browser/device visual checks supplement the automated suite.
