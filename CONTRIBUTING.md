# Contributing

Thanks for your interest in improving the module. Bug reports and suggestions go in
[GitHub Issues](https://github.com/IainFielding/dnd-pdf-character-sheet/issues); code changes
come in as pull requests.

## Commits

Write a short imperative subject line describing the change, and use the body for the
reasoning if it isn't obvious from the diff. See also the two sections below: every commit
needs a sign-off, and no commit should carry AI tool attribution.

### Sign your work — the Developer Certificate of Origin

Every commit must be signed off. Sign-off is a single trailer at the end of the commit
message:

```
Signed-off-by: Your Name <your.email@example.com>
```

`git commit -s` adds it for you, using your configured `user.name` and `user.email`, so
set those once and forget about it:

```sh
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

Adding that line certifies that you wrote the change, or otherwise have the right to
submit it under this project's licence. The full text of what you are certifying is the
Developer Certificate of Origin 1.1, reproduced verbatim in [DCO](DCO) at the root of this
repository — it is worth reading once.

This is **not** a contributor licence agreement. There is no paperwork to sign and no
rights are assigned to anyone; you are simply asserting, per commit, that the code was
yours to give. It matters particularly for AI-assisted changes: whichever tool you used,
the sign-off is you taking responsibility for the licensing of what you submitted.

If you would rather not remember the `-s` flag on every commit, this repository ships a
hook that adds the trailer for you — including on commits made from an editor's
source-control panel, which never pass `-s`:

```sh
git config core.hooksPath .githooks
```

Note that `git config format.signOff true` does **not** do this, despite how it reads:
that setting is honoured only by `git format-patch` and `git send-email`, and git has no
`commit.signOff` equivalent. Setting it and expecting signed-off commits is the usual way
to arrive at a red DCO check.

If you forget, CI will tell you (`.github/workflows/dco.yml` checks every commit in a pull
request). To fix it:

```sh
git commit --amend -s --no-edit       # the most recent commit
git rebase --signoff origin/main      # every commit on your branch
```

Then force-push the branch.

### AI-assisted contributions

AI coding assistants are permitted. You remain fully responsible for the correctness,
licensing, and style compliance of anything you submit, and you must be able to explain
your change on request.

Please do **not** include AI tool attribution in commit messages. Remove trailers such as
`Co-Authored-By: Claude ...`, `Co-authored-by: Copilot ...`, "Generated with ..." footers,
and similar tool sign-offs before opening a pull request. Co-author trailers are reserved
for human contributors.

A local hook catches this before you commit — the same `core.hooksPath` setting as the
sign-off hook above turns both on, so you only need it once:

```sh
git config core.hooksPath .githooks
```

The same check runs in CI on every pull request
(`.github/workflows/no-ai-attribution.yml`), so a stray trailer will fail the build.
