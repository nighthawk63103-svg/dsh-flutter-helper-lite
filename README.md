# dsh-flutter-helper-lite

[![GitHub Repository](https://shields.io)](https://github.com)

[🇷🇺 Русская версия ниже](#-русская-версия)

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
* **`run_script`** — safely executes allowlisted local `.bat` helper scripts (`check_and_test.bat`, `build_apk.bat`, `backup_git.bat`, `project_map.bat`) in the project root via `cmd.exe` (non-interactive `stdin` prevents hangs on `pause`, and output is trimmed to the last 4,000 characters to save tokens).

Paths are resolved from the nearest parent directory containing `pubspec.yaml` (Flutter tools / scripts) or `.git` (Git tools), so tools work regardless of the host process working directory.

## Recommended Helper Scripts (Optional)

You can place these `.bat` scripts in your Flutter project root so the AI agent can trigger them via `run_script` (or run them yourself with a double click):

* **`check_and_test.bat`** — runs `dart format`, `flutter analyze`, and `flutter test` in one pass.
* **`build_apk.bat`** — runs `flutter analyze`, builds `app-release.apk`, and copies it to `build\mindmap_app.apk`.
* **`backup_git.bat`** — stages all changes, commits with a timestamp, and pushes to `origin`.
* **`project_map.bat`** — lists all `lib\*.dart` files with line counts so the model can map the project without multiple directory scans.

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

# 🇷🇺 Русская версия

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
* **`run_script`** — безопасно запускает разрешённые `.bat`-скрипты из корня проекта (`check_and_test.bat`, `build_apk.bat`, `backup_git.bat`, `project_map.bat`) через `cmd.exe` с закрытым потоком ввода (не зависает на `pause`) и обрезкой вывода до последних 4000 символов.

Пути определяются по ближайшей родительской папке с `pubspec.yaml` (инструменты Flutter и скрипты) или `.git` (инструменты Git), поэтому плагин работает независимо от рабочей директории хост-процесса.

## Рекомендуемые `.bat`-скрипты проекта (опционально)

Вы можете разместить эти скрипты в корне вашего Flutter-проекта, чтобы ИИ-агент мог запускать их через `run_script` (или запускать их вручную двойным кликом):

* **`check_and_test.bat`** — последовательно запускает `dart format`, `flutter analyze` и `flutter test`.
* **`build_apk.bat`** — проверяет код через `flutter analyze`, собирает `app-release.apk` и копирует его в `build\mindmap_app.apk`.
* **`backup_git.bat`** — индексирует изменения, делает коммит с текущей датой/временем и отправляет в `origin`.
* **`project_map.bat`** — формирует список всех файлов `lib\*.dart` с количеством строк для быстрой ориентации модели в проекте.

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
