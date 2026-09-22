# Resume Toner

Resume Toner is a local-first desktop app for tailoring a LaTeX resume to a job posting. It prepares a structured prompt for your existing ChatGPT window, validates the response against your exact resume source, lets you accept, edit, or reject every proposed change, and compiles the reviewed result locally.

The desktop app is the recommended way to use Resume Toner. A Chrome extension with a bring-your-own Gemini API key is also available for advanced users and contributors.

## Install the desktop app

### Windows (recommended)

1. Install [MiKTeX](https://miktex.org/download). During setup, allow MiKTeX to install missing packages automatically.
2. Open the [Resume Toner releases page](https://github.com/ParthD77/ResumeToner/releases) and download the latest Windows `.exe` installer.
3. Run the installer. The current community build is unsigned, so Windows may show **Windows protected your PC**. If you trust this repository and verified that the download came from its Releases page, choose **More info**, confirm the publisher is listed as unknown, and choose **Run anyway**.
4. Quit and reopen Resume Toner after installing or updating MiKTeX.

If there is no `.exe` on the Releases page yet, no desktop release has been published. You can build it from source using the instructions below; do not download installers posted in issues or by third parties.

### macOS (Apple silicon)

The macOS build requires macOS 13 or newer and [MacTeX](https://www.tug.org/mactex/). A public Mac build must be signed and notarized by the publisher, so a DMG may not be available yet. If one is published, download it only from the [official Releases page](https://github.com/ParthD77/ResumeToner/releases), drag the app to Applications, and reopen it after installing MacTeX.

## First run

1. Open or paste your base `.tex` resume. Resume Toner compiles it locally with MiKTeX on Windows or MacTeX on macOS.
2. Paste the job posting, generate the prompt, and use it in your own ChatGPT conversation.
3. Paste ChatGPT's JSON response back into Resume Toner.
4. Review every proposed replacement. Synthetic proposals require an explicit truth confirmation.
5. Export the reviewed PDF, and optionally the reviewed `.tex` source.

Choose **This job only** for a job-specific change. Choose **This job + saved base** to promote an accepted change to the saved base after a successful PDF export.

## Your data

- Resume Toner has no account, hosted application backend, analytics, advertising, telemetry, or shared API key.
- The desktop app stores your base resume, active job, pasted response, edits, decisions, and five recent snapshots locally. This storage is not encrypted or a cloud backup.
- The app prepares text for you to paste into ChatGPT. Anything you paste there is handled under your ChatGPT account and OpenAI's applicable terms and settings.
- Download a private JSON backup before uninstalling, changing computers, or switching between development and installed builds. Never commit private backups, resumes, or application data to this public repository.
- Only compile LaTeX you trust. Disabling shell escape does not completely sandbox TeX file access.

See [Privacy](docs/PRIVACY.md), [Security](SECURITY.md), and [Terms](docs/TERMS.md). Users remain responsible for verifying every claim and every generated change before submitting a resume.

## Build the desktop app from source

Requirements:

- Node.js 20 or newer
- Windows 10/11 with MiKTeX for the Windows build
- Apple-silicon Mac with macOS 13+, MacTeX, Xcode command-line tools, and an Apple Developer signing identity for the public Mac build

Clone the repository, then run:

```powershell
npm install
npm test
npm run desktop:dev
```

Build an unsigned Windows installer:

```powershell
npm install
npm test
npm run desktop:build:win
```

The installer is written to `desktop-release-1.1.0/`. Smoke-test installation, LaTeX compilation, PDF and `.tex` export, restart persistence, and backup restoration before publishing it.

To create a GitHub Release with the unsigned installer, install and authenticate the [GitHub CLI](https://cli.github.com/), choose a version tag, and run:

```powershell
$version = (Get-Content package.json | ConvertFrom-Json).version
$installer = Get-ChildItem "desktop-release-$version" -Filter *.exe | Select-Object -First 1
$hashFile = "$($installer.FullName).sha256.txt"
"$((Get-FileHash $installer.FullName -Algorithm SHA256).Hash)  $($installer.Name)" | Set-Content $hashFile
gh release create "v$version" $installer.FullName $hashFile --title "Resume Toner v$version" --notes "Unsigned Windows community build. Windows may show an Unknown publisher warning. Download only from this repository."
```

If the release already exists, upload or replace the asset with:

```powershell
$version = (Get-Content package.json | ConvertFrom-Json).version
$installer = Get-ChildItem "desktop-release-$version" -Filter *.exe | Select-Object -First 1
$hashFile = "$($installer.FullName).sha256.txt"
"$((Get-FileHash $installer.FullName -Algorithm SHA256).Hash)  $($installer.Name)" | Set-Content $hashFile
gh release upload "v$version" $installer.FullName $hashFile --clobber
```

An unsigned release is acceptable for testers and technical early adopters, but it creates a security warning and asks users to make a risky-looking exception. It does not meaningfully eliminate your legal responsibility to distribute safe software; making every user compile the same source mainly shifts inconvenience and build risk to them. For a general public Windows launch, code-sign the installer. Until then, label it clearly as unsigned, publish checksums, keep source and release artifacts tied to a tag, and never tell users to disable antivirus or SmartScreen globally.

Build the signed and notarized Apple-silicon DMG:

```bash
npm install
npm test
npm run desktop:build:mac
```

The Mac build intentionally fails when no `Developer ID Application` identity is available. Configure electron-builder notarization credentials outside the repository (for example `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`), then verify the result before upload:

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Resume Toner Desktop.app"
spctl --assess --type execute --verbose=2 "/Applications/Resume Toner Desktop.app"
xcrun stapler validate desktop-release-*/Resume-Toner-Desktop-*-mac-arm64.dmg
```

## Desktop development notes

- `npm run desktop:preview` builds and opens the production desktop bundle locally.
- The ChatGPT prompt template is `src/desktop/tailoring-prompt.txt`. Keep the `{{RESPONSE_CONTRACT}}`, `{{LATEX}}`, and `{{JOB_POSTING}}` placeholders intact.
- Development and installed builds use different storage origins. Export a private backup before switching between them.
- PDF exports default to `Resume.pdf`; source exports default to `Resume.tex`.

## Chrome extension (alternative)

The extension captures a job page in desktop Chrome, calls Google Gemini with the user's own API key, stores records in Chrome-managed local storage, and exports an ATS-friendly PDF. It is not the recommended onboarding path while no Chrome Web Store listing exists.

To build and load it locally:

```powershell
npm install
npm test
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist` directory. To create the manual ZIP and run the privacy/release audit:

```powershell
npm run audit:release
npm run package
```

The extension sends the full resume and job listing to Google Gemini only when the user invokes the relevant action. Review the current [Gemini pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing) and [Gemini API terms](https://ai.google.dev/gemini-api/terms) before use.

## Current scope

- Windows desktop and Apple-silicon macOS desktop
- English software and technical roles
- Review-first LaTeX replacement workflow using an existing ChatGPT window
- Local history, private JSON backup, PDF export, and `.tex` export
- Optional Chrome extension with Gemini BYOK

Automatic updates, Intel Mac support, the Mac App Store, and local AI models are not currently included.

## Support and licence

Use [GitHub Issues](https://github.com/ParthD77/ResumeToner/issues) for non-private bugs and feature requests. Never post API keys, resumes, or application details in a public issue. Send private privacy or security reports to [parthdhroovji1@gmail.com](mailto:parthdhroovji1@gmail.com).

Source code is available under the Mozilla Public License 2.0. See [LICENSE](LICENSE).
