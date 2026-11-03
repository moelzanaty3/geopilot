# Workflow: review

List changed files with `git diff --name-only <base>...HEAD`, pick out those that can affect a rule, and evaluate each affected rule before and after with `git show <base>:<file>`. Report what's made worse, made better, now unknown, and already a problem in touched files. A rule that went from a Problem to Can't tell is **not fixed**. Edit nothing and post nothing.
