# Configuration

Loop Engineer reads YAML from `loop-engineer.yml` unless `--config` points elsewhere. The schema rejects unknown keys.

`project.root` resolves from the directory where you start the CLI. `workflow.max_cycles` accepts 1 through 20. `workflow.max_runtime_minutes` accepts 1 through 1440.

Role permissions have fixed safety constraints:

| Role                                    | Required permission   |
| --------------------------------------- | --------------------- |
| analyst, planner, reviewer, final_judge | `read-only`           |
| implementer, fixer                      | `workspace-write`     |
| tester                                  | `predefined-commands` |

The tester must use `local` in normal configuration. Tests may use the internal `fake` provider.

LLM role entries accept `model` and an optional `effort`. Supported effort values are `auto`, `low`, `medium`, `high`, `xhigh`, `max` and `ultra`; the chosen provider and model determine which values are valid in the GUI. `auto` leaves the provider default unchanged. Claude receives the value through `--effort`; Codex receives it as `model_reasoning_effort`. The local tester does not use a model or effort.

Quality gates can require passing commands, reviewer approval and zero findings at configured severities. The default blocks `critical` and `high`.

The `install` command records a detected install command for future use. The MVP does not run it when `allow_package_install` is false, which is the default.

`security.network_access` controls network-capable agent tools, not the provider CLI's connection to its vendor service. The MVP does not grant network tools to roles.
