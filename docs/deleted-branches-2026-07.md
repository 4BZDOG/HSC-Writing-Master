# Deleted branch manifest — 2026-07-25

All 32 `claude/*` branches were deleted from the remote on 2026-07-25. Every
branch listed here was either fully merged into `main` or judged too stale to
revive (the unmerged ones sat 94 commits behind `main`).

Nothing is lost. GitHub retains the commit objects, so any branch can be
restored by SHA:

```
git push origin <sha>:refs/heads/<branch>
```

## Merged branches

| Branch | Tip SHA | Landed via |
|---|---|---|
| `claude/admin-functions-review-2hyanq` | `43e53bd00327552aa95569ad04360ba1629da0a3` | PRs #27-#33 merged |
| `claude/ai-course-topic-tools-review-pwhvo9` | `0230fb1d9d755eff4c56bc6d420c1f808c687dd5` | PR #43 merged |
| `claude/ai-evaluations-slow-1kdh09` | `d37bab236392c5b55824136cae090ea90fb8f3d4` | PR #97 merged |
| `claude/ai-service-405-error-a07cjs` | `84211da5d5ed2bd26eab7610c8dac22603e43da9` | PR #41 merged |
| `claude/course-question-workflow-improvements-if0k8o` | `190e1d94273a80d5931e0928ef31a32121c6056a` | PRs #48-#67 merged |
| `claude/create-skill-documentation-9y1Yy` | `a30edc8f176aa5a4b2e813b53c256ea2254eca06` | PR #5 merged |
| `claude/document-project-overview-NL8g9` | `604ac5f7cec7a0287fd31849eee7946719c487ad` | PRs #1, #2 merged (#4 closed unmerged) |
| `claude/dreamy-fermat-67d5z7` | `07eb0146f888b8a48c0aa68f079bb7e56dcb926e` | PR #24 merged |
| `claude/eval-perf-layout-review-m2sig6` | `39e899038aafc59b9bc642153b484d3bf749feaa` | PRs #98, #99 merged |
| `claude/focus-screen-layout-review-dhme3u` | `8bf656c6b53ebd1e691be684cba0991ffb5fec6f` | PRs #100-#103 merged |
| `claude/groq-free-tier-api-goduoq` | `1da0fa877d1694e755fb2e299e9f38cf9d7185bd` | PR #40 merged |
| `claude/hsc-command-verbs-revision-84rw0s` | `c78137e7df44e590e7eca9e9afd6f0a29ecf8c7d` | PR #78 merged |
| `claude/loving-mayer-ckie1i` | `15edfbb7d2e56e5fe40494bec3b9df65f292d124` | PRs #19-#23 merged |
| `claude/main-ui-refinement-hivdno` | `a09334b89ad85dd403f2b170fc0d27fc7fd4054c` | PRs #37, #39 merged |
| `claude/paywall-server-enforcement` | `aa137d3dc386f1c7d13f72019ccf64848266ef2a` | PR #106 merged |
| `claude/pdf-export-a11y-announce` | `6de428b2e5841dc042bd725b62d99f803552c167` | PR #105 merged |
| `claude/pr-review-bug-fixes-vpak9h` | `915a3fbc16943db2417228ebd9c891c29825fadb` | PRs #68-#76 merged |
| `claude/project-orientation-skill` | `5dddbe4763fb17157a35a2fbb23187cbe87657a6` | PR #35 merged |
| `claude/project-roadmap-updates-rulsqg` | `cf850221853fc2a38580df0e7d51b7ba3bfb8451` | PRs #34, #36 merged |
| `claude/review-recent-prs-p04q9u` | `a12ecabfc0e86c53b5a9b16c4f7d8999e70c7356` | PRs #45-#47 merged |
| `claude/stripe-monetization-review-0ymqtz` | `9415888c93fd8624472e1ca63937b69e39c78b96` | PR #104 merged |
| `claude/supabase-implementation-improve-7nn13w` | `3b9ee2a248580a5a86e92d11276b2464d41d3bee` | PR #25 merged |
| `claude/syllabus-import-feature-nozyng` | `5e267fbf668b69074f8ab0a4f1c527bf1b210d24` | PR #42 merged |
| `claude/vercel-deployment-docs-ZOJU5` | `a0a72e219190f786e806bcb8ca4176ad5774288a` | PRs #7-#18 merged |
| `claude/vercel-supabase-setup-guides-exngm7` | `012279b1785fbf5c8a2d3f7eca4b904411efc195` | PR #44 merged |
| `claude/writing-evaluation-review-bugs-2c92hq` | `17f2c1b6a8aa744da1ddd0270ec58e9095519b47` | PRs #77-#96 merged |

## Branches deleted without ever landing

These carried work that never reached `main`. They were deleted as stale by
explicit decision, not because their content was merged. If any of this work
is ever wanted again, restore by SHA above and rebase onto `main`.

| Branch | Tip SHA | Status |
|---|---|---|
| `claude/ai-response-marking-review-4rnlxs` | `14089989153a0597174d8060b8bfcc7479d8b25e` | **never merged** - no PR ever opened |
| `claude/project-review-roadmap-wO8Rf` | `02f58c771ea2815def6d1c6b292753857395ddf5` | **never merged** - PR #6 closed unmerged |
| `claude/project-skill-md-dezbrr` | `126c9dc7c849353a2220752293b69c1ad2ddc5a0` | **never merged** - PR #26 closed unmerged |
| `claude/review-and-fix-bugs-mQ31v` | `852f91116ba6f09404552dcc2243dabf46cd2aa4` | **never merged** - no PR ever opened |
| `claude/student-writing-area-review-wo6uz7` | `97ff4c20ff765494891ef200912ef31f69a0bf6b` | **never merged** - no PR ever opened |
| `claude/ui-improvements-desktop-mobile-fmiknl` | `eb73bdebe0193d3ccc51efba4a552a859f3649b6` | **never merged** - no PR ever opened |

## How to run the deletion

Branch deletion is blocked from the Claude Code web sandbox (the git proxy
returns 403 on any ref delete), so run this from a local clone:

```sh
git fetch --prune origin
git ls-remote --heads origin \
  | awk '{print $2}' | sed 's|refs/heads/||' \
  | grep '^claude/' \
  | xargs -n 20 git push origin --delete
```

Or delete them from the GitHub UI at **Branches → All branches**.
