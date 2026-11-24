# dsh-flutter-helper-lite — v1.8.0

[![GitHub Repository](https://shields.io)](https://github.com)
[![Plugin Version](https://img.shields.io/badge/version-v1.8.0-blue)](package.json)

[🇷🇺 Русская версия ниже](#-русская-версия)

**Current version: `v1.8.0`** (see `package.json` → `"version": "1.8.0"`)

**Lightweight Flutter helper plugin for DeepSeek Harness — bypasses Windows 10 PTY shell crashes and saves context/VRAM for compact local models (4B–8B).**

Repository: https://github.com

## Why This Plugin?

1. **Bypasses `PTY shell exited during startup` on Windows 10** — runs Flutter, Git, and project `.bat` scripts directly from Node.js (no PTY), avoiding the broken `ConPTY / pwsh` pseudo-terminal.
2. **Saves VRAM and Context Window** — lets compact local models (`Qwen 4B–8B`) inspect large `.dart` files via a lightweight code outline and run bundled project scripts without flooding the context with long build logs.
3. **Code Safety Checkpoints** — built-in Git snapshot and rollback tools protect your project from accidental syntax breaks during AI edits.
4. **Zero External Dependencies** — uses only built-in Node.js modules (`node:fs`, `node:path`, `node:child_process`), requiring no `npm install` or third-party packages.

## Available Tools

* **`flutter_outline`** — extracts a `.dart` file skeleton (`class`, `void`, `Widget`, `Future<`, `State<` with line numbers), skipping comments, for fast navigation without context overflow.
* **`flutter_check`** — formats the selected file (`dart format <file>`) and runs static analysis (`flutter analyze`) inside the detected Flutter project root.
* **`git_save`** — creates a Git checkpoint (`git add` + `git commit -m "checkpoint"`) before editing files.
* **`git_undo`** — reverts uncommitted changes (all tracked changes, or only the given path) if an edit breaks compilation.
* **`git_push`** — pushes the current branch to `origin` (reads `GITHUB_TOKEN` from a local `.env` file via a secure Git credential helper; without it, falls back to normal Git credentials).
* **`flutter_build_apk`** — builds a release Android APK (`flutter build apk --release`) and copies it to the requested path (requires Android SDK & JDK 17).
* **`run_script`** — safely executes allowlisted local `.bat` helper scripts from the Flutter project root via `cmd.exe` (non-interactive `stdin` prevents hangs on `pause`, and output is trimmed to the last 4,000 characters to save tokens). **In `v1.8.0` the allowlist contains 7 primary scripts** — `check_and_test.bat`, `build_apk.bat`, `backup_git.bat`, `project_map.bat`, `context_pack.bat`, `autofix.bat`, `release_all.bat` — plus 3 older scripts kept for backward compatibility (`symbols_map.bat`, `fast_check.bat`, `git_diff_summary.bat`). Any other file name is rejected by the strict allowlist, so a model-supplied string can never become an arbitrary command.

Paths are resolved from the nearest parent directory containing `pubspec.yaml` (Flutter tools / scripts) or `.git` (Git tools), so tools work regardless of the host process working directory.

## Tools Reference (v1.8.0)

| Tool | Purpose | Args | Exit codes |
| --- | --- | --- | --- |
| `flutter_outline` | Class/void/Widget/State outline with line numbers | `filePath` (required) | `0` (text result) |
| `flutter_check` | `dart format <file>` + `flutter analyze` | `filePath` (required) | `0`; report says when a check failed |
| `git_save` | Stage + commit a checkpoint | `message?`, `paths?`, `filePath?` | `0`; error text on git failure |
| `git_undo` | Revert uncommitted changes | `filePath?` | `0`; error text on git failure |
| `git_push` | Push the current branch to `origin` | none | `0`; error text on failure |
| `flutter_build_apk` | Build a release APK and copy it | `outputPath` (required) | `0`; error text on failure |
| `run_script` | Run an allowlisted project `.bat` | `scriptName` (required, `.bat` optional), `compact?` | `0`; script failure reported in text |
| `check_gitignore` | Assert the 5 required ignore patterns | `gitignorePath?` | `0` OK / `1` MISSING |
| `check_diff_paths` | Assert the diff avoids `docs/protected.json` paths | `configPath?`, `baseRef?` | `0` OK / `1` TOUCHED |
| `flutter_test_summary` | One-line test tally | none | `0` / `1` when any test failed |
| `version_bump` | Delegate to `scripts/bump_version.bat` | `arg` = major\|minor\|patch, `dryRun?` | script exit code echoed in output |
| `git_secret_scan` | Scan all history for secret filenames | `patterns?` (array) | `0` CLEAN / `1` HISTORY |

Exit code `1` is surfaced by the tool call failing with the same body text the tool would otherwise print.

## Maintenance notes

* **Reloading after a code change** — `index.js` is evaluated when the plugin bundle is registered. After editing `index.js`, toggle the plugin bundle off and on again to re-register the tools: HMR does not pick up new or changed tool definitions.
* **`check_diff_paths` baseline** — the tool resolves its diff base as `baseRef` → `config.base` → the first matching entry of `config.baseFallback` → the repository's first commit. Here `docs/protected.json` sets `base` to `"main"` (that branch does not exist) and `baseFallback` to `["master"]`, so resolution falls through to `master` and the effective baseline is `master`.

## Recommended Helper Scripts (Optional)

You can place these `.bat` scripts in your Flutter project root so the AI agent can trigger them via `run_script` (or run them yourself with a double click).

### 7 supported scripts in `v1.8.0`

* **`check_and_test.bat`** — runs `dart format`, `flutter analyze`, and `flutter test` in one pass.
* **`build_apk.bat`** — runs `flutter analyze`, builds `app-release.apk`, and copies it to `build\mindmap_app.apk`.
* **`backup_git.bat`** — stages all changes, commits with a timestamp, and pushes to `origin`.
* **`project_map.bat`** — lists all `lib\*.dart` files with line counts so the model can map the project without multiple directory scans.
* **`context_pack.bat`** — one-shot context bundle: the last 3 commits (`git log -n 3 --oneline`) plus a symbol map of every `lib\*.dart` file (declarations with line numbers via PowerShell `Select-String`), so a new session can get oriented from a single cheap output.
* **`autofix.bat`** — safe automatic repair pass: `dart fix --apply`, then `dart format lib test`, then `flutter analyze --no-pub` — fixes what the analyzer can fix before you spend tokens on manual edits.
* **`release_all.bat`** — full guarded release pipeline with fail-fast (`if errorlevel 1`): `autofix.bat` → `flutter test` → `flutter build apk --release --split-per-abi` → copies `app-arm64-v8a-release.apk` to `build\mindmap_app.apk` → commits with `"release build"`. Stops at the first failing step and exits with code 1.

### Also allowed in the `v1.8.0` allowlist (backward compatibility)

* **`symbols_map.bat`** — prints a token-cheap class/method map of every `lib\*.dart` file (`class`, `enum`, `mixin`, `extension`, `void`, `Future<`, `State<`, `Widget`, fields with line numbers) via PowerShell `Select-String`, so the model sees declarations without reading whole files.
* **`fast_check.bat`** — quick gate before a commit: `dart format lib` followed by `flutter analyze --no-pub` (skips the package resolution step, so it is faster and works offline).
* **`git_diff_summary.bat`** — compact change overview: short `git status -s` plus `git diff --stat`, so the model knows what changed without dumping full diffs into the context.

## Installation

1. Make sure **Flutter SDK** and **Git** are installed and added to your system `PATH` (plus **Android SDK & JDK 17** if you plan to build APKs).
2. In **DeepSeek Harness**, open **Plugins → `+ Add Plugin`**.
3. In the input field, paste the GitHub repository URL:
   https://github.com
   *(Alternatively, select **Local directory** in the source dropdown on the right and paste the path to your downloaded `dsh-flutter-helper-lite` folder).*
4. Click **Install** and enable the plugin toggle in the installed plugins list.
5. *(Optional)* To use `git_push`, create a `.env` file in the plugin folder containing `GITHUB_TOKEN=your_token` (`.env` is already excluded in `.gitignore`).

## License

MIT License

---

# 🇷🇺 Русская версия — v1.8.0

**Версия плагина: `v1.8.0`** (см. `package.json` → `"version": "1.8.0"`)

**Облегчённый плагин для разработки на Flutter в DeepSeek Harness — обходит падения терминала на Windows 10 и экономит видеопамять и токены для компактных локальных и облачных моделей.**

Репозиторий на GitHub: https://github.com

## Зачем нужен этот плагин?

1. **Обход ошибки `PTY shell exited during startup` на Windows 10** — выполняет команды Flutter, Git и локальные `.bat`-скрипты проекта напрямую из Node.js (без PTY), минуя проблемный псевдотерминал `ConPTY / pwsh`.
2. **Экономия видеопамяти (VRAM), контекста и токенов** — позволяет моделям изучать структуру больших `.dart`-файлов по оглавлению и запускать пакетные скрипты сборки/проверки с обрезкой длинных логов (последние 4000 символов).
3. **Защита от поломки кода** — встроенные точки отката Git позволяют мгновенно восстановить рабочую версию при неудачной правке.
4. **Ноль внешних зависимостей** — работает исключительно на встроенных модулях Node.js (`node:fs`, `node:path`, `node:child_process`), не требует установки `npm` или сторонних пакетов.

## Инструменты

* **`flutter_outline`** — извлекает «скелет» `.dart`-файла (`class`, `void`, `Widget`, `Future<`, `State<` с номерами строк), пропуская комментарии, для быстрой навигации по коду.
* **`flutter_check`** — форматирует выбранный файл (`dart format <file>`) и проверяет проект на ошибки (`flutter analyze`) в найденном корне Flutter-проекта.
* **`git_save`** — создаёт контрольную точку (`git add` + `git commit -m "checkpoint"`) перед внесением изменений.
* **`git_undo`** — откатывает незакоммиченные изменения (все отслеживаемые или только указанный путь), если правка сломала сборку.
* **`git_push`** — отправляет текущую ветку в `origin` (читает `GITHUB_TOKEN` из локального файла `.env` через безопасный credential-helper; без него используются обычные учётные данные Git).
* **`flutter_build_apk`** — собирает release-APK (`flutter build apk --release`) и копирует его по указанному пути (требуются Android SDK и JDK 17).
* **`run_script`** — безопасно запускает разрешённые `.bat`-скрипты из корня проекта через `cmd.exe` с закрытым потоком ввода (не зависает на `pause`) и обрезкой вывода до последних 4000 символов. **В `v1.8.0` в белом списке 7 основных скриптов** — `check_and_test.bat`, `build_apk.bat`, `backup_git.bat`, `project_map.bat`, `context_pack.bat`, `autofix.bat`, `release_all.bat` — плюс 3 старых для обратной совместимости (`symbols_map.bat`, `fast_check.bat`, `git_diff_summary.bat`). Любое другое имя файла отклоняется строгим белым списком, поэтому строка от модели никогда не превращается в произвольную команду.

Пути определяются по ближайшей родительской папке с `pubspec.yaml` (инструменты Flutter и скрипты) или `.git` (инструменты Git), поэтому плагин работает независимо от рабочей директории хост-процесса.

## Примечания по обслуживанию

* **Перезагрузка после правки кода** — `index.js` читается при регистрации бандла плагина. После правки `index.js` выключите и снова включите бандл, чтобы инструменты перерегистрировались: HMR новые и изменённые определения инструментов не подхватывает.
* **Базовая точка `check_diff_paths`** — базовый коммит выбирается по порядку: аргумент `baseRef` → `config.base` → первый подходящий элемент `config.baseFallback` → первый коммит репозитория. В `docs/protected.json` заданы `base: "main"` (такой ветки нет) и `baseFallback: ["master"]`, поэтому выбор падает на `master`, и фактическая база — `master`.

## Рекомендуемые `.bat`-скрипты проекта (опционально)

Вы можете разместить эти скрипты в корне вашего Flutter-проекта, чтобы ИИ-агент мог запускать их через `run_script` (или запускать их вручную двойным кликом).

### 7 поддерживаемых скриптов в `v1.8.0`

* **`check_and_test.bat`** — последовательно запускает `dart format`, `flutter analyze` и `flutter test`.
* **`build_apk.bat`** — проверяет код через `flutter analyze`, собирает `app-release.apk` и копирует его в `build\mindmap_app.apk`.
* **`backup_git.bat`** — индексирует изменения, делает коммит с текущей датой/временем и отправляет в `origin`.
* **`project_map.bat`** — формирует список всех файлов `lib\*.dart` с количеством строк для быстрой ориентации модели в проекте.
* **`context_pack.bat`** — разовый «пакет контекста»: последние 3 коммита (`git log -n 3 --oneline`) плюс карта объявлений по всем `lib\*.dart` (с номерами строк через PowerShell `Select-String`), чтобы новая сессия сориентировалась одним дешёвым выводом.
* **`autofix.bat`** — безопасный автопрогон исправлений: `dart fix --apply`, затем `dart format lib test`, затем `flutter analyze --no-pub` — исправляет то, что может анализатор, до траты токенов на ручные правки.
* **`release_all.bat`** — полный релизный конвейер с остановкой на первой ошибке (`if errorlevel 1`): `autofix.bat` → `flutter test` → `flutter build apk --release --split-per-abi` → копирование `app-arm64-v8a-release.apk` в `build\mindmap_app.apk` → коммит `"release build"`. При сбое любого шага завершается с кодом 1.

### Также разрешены в белом списке `v1.8.0` (обратная совместимость)

* **`symbols_map.bat`** — печатает экономную карту классов и методов по всем файлам `lib\*.dart` (`class`, `enum`, `mixin`, `extension`, `void`, `Future<`, `State<`, `Widget` и поля с номерами строк) через PowerShell `Select-String`, чтобы модель видела объявления, не читая файлы целиком.
* **`fast_check.bat`** — быстрая проверка перед коммитом: `dart format lib`, затем `flutter analyze --no-pub` (без повторного разрешения зависимостей — быстрее и работает офлайн).
* **`git_diff_summary.bat`** — компактная сводка изменений: короткий `git status -s` плюс `git diff --stat`, чтобы модель понимала, что изменилось, без вываливания полных диффов в контекст.

## Установка

1. Убедитесь, что **Flutter SDK** и **Git** установлены и добавлены в системный `PATH` (а также **Android SDK и JDK 17**, если планируете собирать APK).
2. В **DeepSeek Harness** откройте **Плагины → `+ Добавить плагин`**.
3. В поле ввода вставьте ссылку на репозиторий GitHub:
   https://github.com
   *(Либо выберите справа в выпадающем списке вариант для локальной папки и вставьте путь к скачанной директории `dsh-flutter-helper-lite`).*
4. Нажмите **«Установить»** и включите переключатель плагина в списке установленных компонентов.
5. *(Опционально)* Для работы `git_push` создайте в папке плагина файл `.env` со строкой `GITHUB_TOKEN=ваш_токен` (файл `.env` уже добавлен в `.gitignore`).

## Лицензия

MIT License
