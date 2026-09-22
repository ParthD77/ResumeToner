# Privacy Policy

Last updated: September 22, 2026

Resume Toner is a local-first, open-source desktop app with an optional Chrome extension. It has no developer-operated application backend, user account, analytics, advertising, or telemetry. The developer cannot remotely view users' resumes, application data, or API keys.

Official installers and disk images are distributed through GitHub Releases. GitHub may process download metadata under its own privacy terms; Resume Toner does not receive resume contents or application data merely because a user downloads a release. Code signing and Apple notarization, when used, verify the publisher and software integrity and do not send resume content to the developer.

## Desktop app

The desktop app handles the LaTeX resume, job posting, ChatGPT prompt and response, review decisions, settings, and exports supplied or created by the user. It stores the current session and recent snapshots in local application storage. This storage is not encrypted and is not a cloud backup. A person with access to the unlocked device may be able to recover it.

The app prepares a prompt from the resume and job information supplied by the user. The user reviews and manually pastes that prompt into their own ChatGPT conversation, then manually pastes the response back into Resume Toner. Resume Toner does not operate an OpenAI API key or backend. Information submitted to ChatGPT is handled under the user's OpenAI account, plan, settings, and applicable terms.

Desktop users can export and restore a private local JSON backup and export their LaTeX source. Backups and other downloaded files remain wherever the user saves them. Users should delete local application data and saved files themselves when they are no longer needed.

## Optional Chrome extension

The extension handles resume profiles, uploaded source PDFs, career evidence, captured listings, tailoring runs, decisions, settings, and application history in Chrome-managed storage until the user deletes them or uninstalls the extension.

The Gemini API key is stored in local extension storage. It is not synchronized, included in backups, logged, or sent to Resume Toner. Chrome storage is not encrypted. Anyone with access to an unlocked Chrome profile may potentially recover locally stored information.

The extension connects to Google's Gemini API only in response to a user action and uses the user's own API key:

- PDF import sends text extracted locally from a user-selected PDF to Gemini so it can be structured for review.
- Analyze sends the full resume, saved career evidence, optional user-confirmed context, and selected job listing to Gemini.
- Compact sends relevant resume content and job requirements to Gemini.

Google's current [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing) distinguish between free and paid services. A resume can contain sensitive personal information, including a name, email address, phone number, location, education, and employment history. Users should review Google's current terms and choose an account and billing arrangement appropriate for that information before sending it.

Users can delete individual application records, delete all structured extension data, forget the saved API key, and export a backup that excludes the API key. The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## How information is used

Resume Toner uses information only to import, review, tailor, preview, export, and locally organize resumes. It does not sell data, use it for advertising, determine creditworthiness, allow the developer to remotely read it, or transfer it for purposes unrelated to its resume-tailoring function.

Resume Toner checks whether suggestions are supported by information the user supplied; it cannot independently verify that resume claims or chatbot context are true. It provides automated drafting and editing suggestions only. Users must review and verify all generated content before using or submitting it and must not submit false, misleading, fraudulent, or unlawful information. Resume Toner does not guarantee employment, interviews, ATS performance, eligibility, or the accuracy of AI-generated output.

## Questions

General questions may be submitted through [GitHub Issues](https://github.com/ParthD77/ResumeToner/issues). Do not post resumes, API keys, or other private information in a public issue. Privacy and security reports may be sent privately to [parthdhroovji1@gmail.com](mailto:parthdhroovji1@gmail.com).
