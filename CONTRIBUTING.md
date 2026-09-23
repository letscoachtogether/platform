# Contributing

Thanks for considering a contribution to this project.

## Getting set up

Follow the **Setup** section in [README.md](README.md) — you'll need a MongoDB
database and, for full functionality, Stripe/Cal.com/Resend accounts (test/sandbox
mode is fine for all three).

## Making changes

1. Fork the repo and create a branch off `main`.
2. Keep changes focused — one logical change per pull request.
3. Match the existing code style (see `code/` for conventions: controllers grouped
   by area, one Mongoose schema per file in `code/models/`).
4. Test your change manually against the flow it touches (e.g. if you change
   checkout, actually run a Stripe test-mode purchase end to end) before opening
   a PR. There's no automated test suite yet — see the note in README about that
   gap.
5. Don't commit secrets. `.env` is gitignored for a reason; use `.env.example` to
   document any new environment variable your change introduces.

## Opening a pull request

Describe what the change does and why, and call out anything a reviewer should
manually verify (there's no CI to catch it for you). Screenshots are appreciated
for anything UI-facing.

## Reporting bugs / requesting features

Open an issue. Include repro steps for bugs — this is a small solo-coaching
platform, not a generic framework, so context on your specific setup helps.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating,
you're expected to uphold it.
