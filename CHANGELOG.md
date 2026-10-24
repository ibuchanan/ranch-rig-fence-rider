# Changelog

All notable changes to this project are documented here.

## [0.1.0] - 2026-10-24

### 🚀 Features

- _(cli)_ Add side-effect-free entry point
- _(deploy)_ Add selective encrypted deployment
- _(deploy)_ Honor target overrides and Forge options
- _(config)_ Unify configured deployment targeting
- _(lint)_ Add configured Forge lint workflow
- _(install)_ Add configured Forge installation
- _(uninstall)_ Add configured uninstall workflow
- _(tunnel)_ Add configured local runtime delivery
- _(setup)_ Deliver package-local SecretSpec
- _(doctor)_ Move tool version checks into a doctor command
- _(doctor)_ Set lowest supported versions to SecretSpec 0.17 and Forge CLI 1.3
- _(doctor)_ Warn about scopes Fence Rider never reads
- _(deploy)_ [**breaking**] Split variable upload from generated deploy and tunnel
- _(doctor)_ Report the runtime scope
- _(doctor)_ Validate the SecretSpec schema
- _(doctor)_ Warn about ambient shadowing
- _(doctor)_ Report unresolved required values
- _(cli)_ [**breaking**] Adopt Commander and explicit Forge handoff

### 🐛 Bug Fixes

- _(deploy)_ Validate configuration edge cases
- _(deploy)_ Propagate failures and interruption
- _(doctor)_ Ask SecretSpec for the manifest scope
- _(doctor)_ Reword the unreadable version message
- _(cli)_ Improve agent-facing option diagnostics

### 💼 Other

- _(scripts)_ Run check steps directly and rename build output
- _(scripts)_ Drop missing size and pack gates from check
- _(deps)_ Track bun.lock and move engines after packageManager

### 🚜 Refactor

- _(deploy)_ Resolve Fallow health findings
- _(process)_ Extract process supervision module
- _(workflow)_ Add workflow runner with typed failures
- _(workflow)_ Migrate install, uninstall and tunnel to runWorkflow
- _(deploy)_ Migrate deploy to runWorkflow
- _(setup)_ Migrate setup to runWorkflow
- _(secretspec)_ Define SecretSpec version and location once
- _(configured)_ Replace validator chains with typed parsers
- _(policy)_ Share target and local-control policy
- _(args)_ Share one declarative Forge argument parser
- _(cli)_ Dispatch from one command table with single-source help
- _(tests)_ Split the CLI test file for parallel runs
- _(setup)_ Record decisions on setup prerequisites and hooks
- _(args)_ Delegate Forge option validation to Forge
- _(deploy)_ Extract pure deploy plan from workflow
- _(install)_ Extract pure install and tunnel plans
- _(configured)_ Extract pure resolution parsing
- _(configured)_ Move environment alias rule to resolution
- _(setup)_ Require SecretSpec CLI on PATH instead of downloading it
- _(configured)_ Remove FORGE_ENV alias; FORGE_ENVIRONMENT is the only control
- _(configured)_ Ask SecretSpec for scope membership instead of parsing its TOML
- _(install)_ Take install and uninstall targets from the profile only
- _(install)_ Run install and uninstall under secretspec run
- _(lint)_ Run lint under secretspec run
- _(scripts)_ Print shell scripts for lint, install and uninstall
- _(install)_ Drop target options from install and uninstall with a note
- _(cli)_ Inject output through an Io seam
- _(cli)_ Route helpers, PATH and files through Io

### 📚 Documentation

- Resolve remaining Markdown lint findings
- _(workflows)_ Document configured consumer workflows
- _(reference)_ Embed CLI help once and trim restated usage
- _(reference)_ Describe delegated Forge argument handling
- _(reference)_ Remove local ticket cross-references
- _(variables)_ Document the variables step and generated deploy
- _(development)_ Describe the unit and integration test tiers
- _(readme)_ Use dist/fence-rider as the built CLI path
- _(adr)_ Record the rejected re-entrant variables option
- _(specs)_ Reorganize specs into future work
- _(how-to)_ Collapse consumer workflows into installation
- _(how-to)_ Split how-to into local, manifest and runtime guides
- _(reference)_ Trim variable reference to contract and tables
- _(reference)_ Prune validation evidence into a runbook
- _(tutorials)_ Add full package scripts tutorial
- _(tooling)_ Explain SecretSpec setup and Forge workflows
- _(tooling)_ Reconcile consumer guides and validate links
- _(reference)_ Preserve table and list separation
- _(providers)_ Document semantic storage roles

### 🎨 Styling

- _(src)_ Sort imports in deploy, setup and tunnel

### 🧪 Testing

- _(workflow)_ Validate and document deployment
- _(consumer)_ Add installed consumer workflow acceptance
- _(check)_ Follow renamed lint script and inline test command
- _(args)_ Add property-based tests with fast-check
- _(support)_ Share one compiled CLI across test files
- _(native)_ Drop native rows decided by wrapper-only checks
- _(scripts)_ Test generated scripts in-process with fast sh fakes
- _(layout)_ Split tests into unit and integration
- _(layout)_ Split scripts, shell and tunnel-plan tests
- _(variables)_ Run variables tests in-process
- _(tunnel)_ Run tunnel generator tests in-process
- _(doctor)_ Run doctor checks in-process
- _(fixtures)_ Share fake tools across projects
- _(integration)_ Drop duplicate rows across native and tunnel tests
- _(gate)_ Fail check when SecretSpec is missing
- _(cases)_ Report each table case as its own test
- _(guarantees)_ Name the leak and no-tool-call assertions
- _(fixtures)_ Make the default shared value plain
- _(spec)_ Build test specs instead of patching text
- _(fakes)_ Move the spawned fake tool into typed source
- _(workspace)_ Keep test temp directories under tmp/
- _(fakes)_ Share SecretSpec answers and check them natively
- _(process)_ Test the process supervisor directly
- _(integration)_ Group integration tests by what they need

### ⚙️ Miscellaneous Tasks

- _(scaffold)_ Initial project scaffold
- _(src)_ Sort imports
- _(docs)_ Ignore .scratch in doc linters
- _(tooling)_ Align template updates with repo workflows
- _(tooling)_ Preserve frontmatter and summarize Fallow
- _(lint)_ Recognize the configured Markdown link rule
- _(check)_ Restore direct parallel validation

### ◀️ Revert

- _(install)_ Refuse target options again instead of dropping them
