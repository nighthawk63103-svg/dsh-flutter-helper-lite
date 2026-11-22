# dsh-flutter-helper-lite

[🇷🇺 Русская версия ниже](#-русская-версия)

**Lightweight Flutter helper plugin for DeepSeek Harness — bypasses Windows 10 PTY shell crashes and saves context/VRAM for compact local models (4B–8B).**

## Why This Plugin?

1. **Bypasses `PTY shell exited during startup` on Windows 10** — runs Flutter and Git commands directly from Node.js (no PTY), avoiding the broken `ConPTY / pwsh` pseudo-terminal.
2. **Saves VRAM and Context Window** — lets compact local models (`Qwen 4B–8B`) inspect large `.dart` files via a lightweight code outline instead of reading entire files.
3. **Code Safety Checkpoints** — built-in Git snapshot and rollback tools protect your project from accidental syntax breaks during AI edits.
4. **Zero External Dependencies** — uses only built-in Node.js modules (`node:fs`, `node:path`, `node:child_process`), requiring no `npm install` or third-party packages.

## Available Tools

* **`flutter_outline`** — extracts a `.dart` file skeleton (`class`, `void`, `Widget`, `Future<`, `State<` with line numbers), skipping comments, for fast navigation without context overflow.
* **`flutter_check`** — formats the selected file (`dart format <file>`) and runs static analysis (`flutter analyze`) inside the detected Flutter project root.
* **`git_save`** — creates a Git checkpoint (`git add` + `git commit -m "checkpoint"`) before editing files.
* **`git_undo`** — reverts uncommitted changes (all tracked changes, or only the given path) if an edit breaks compilation.
* **`git_push`** — pushes the current branch to `origin` (reads `GITHUB_TOKEN` from a local `.env` file; without it, falls back to normal Git credentials).
* **`flutter_build_apk`** — builds a release Android APK (`flutter build apk --release`) and copies it to the requested path.

Paths are resolved from the nearest parent directory containing `pubspec.yaml` (Flutter tools) or `.git` (Git tools), so tools work regardless of the host process working directory.

## Installation

1. Make sure **Flutter SDK** and **Git** are installed and added to your system `PATH`.
2. In **DeepSeek Harness**, open **Plugins → Add Plugin → Local Folder** and select the `dsh-flutter-helper-lite` directory.
3. Enable the plugin toggle in the components list.
4. *(Optional)* To use `git_push`, create a `.env` file in the plugin folder containing `GITHUB_TOKEN=your_token` (`.env` is already excluded in `.gitignore`).

## License

MIT License

---

# 🇷🇺 Русская версия

**Облегчённый плагин для разработки на Flutter в DeepSeek Harness — обходит падения терминала на Windows 10 и экономит видеопамять для компактных локальных моделей (4B–8B).**

## Зачем нужен этот плагин?

1. **Обход ошибки `PTY shell exited during startup` на Windows 10** — выполняет команды Flutter и Git напрямую из Node.js (без PTY), минуя проблемный псевдотерминал `ConPTY / pwsh`.
2. **Экономия видеопамяти (VRAM) и контекста** — позволяет компактным локальным моделям (`Qwen 4B–8B`) изучать структуру больших `.dart`-файлов по оглавлению, не забивая память целиком.
3. **Защита от поломки кода** — встроенные точки отката Git позволяют мгновенно восстановить рабочую версию при неудачной правке.
4. **Ноль внешних зависимостей** — работает исключительно на встроенных модулях Node.js (`node:fs`, `node:path`, `node:child_process`), не требует установки `npm` или сторонних пакетов.

## Инструменты

* **`flutter_outline`** — извлекает «скелет» `.dart`-файла (`class`, `void`, `Widget`, `Future<`, `State<` с номерами строк), пропуская комментарии, для быстрой навигации по коду.
* **`flutter_check`** — форматирует выбранный файл (`dart format <file>`) и проверяет проект на ошибки (`flutter analyze`) в найденном корне Flutter-проекта.
* **`git_save`** — создаёт контрольную точку (`git add` + `git commit -m "checkpoint"`) перед внесением изменений.
* **`git_undo`** — откатывает незакоммиченные изменения (все отслеживаемые или только указанный путь), если правка сломала сборку.
* **`git_push`** — отправляет текущую ветку в `origin` (читает `GITHUB_TOKEN` из локального файла `.env`; без него используются обычные учётные данные Git).
* **`flutter_build_apk`** — собирает release-APK (`flutter build apk --release`) и копирует его по указанному пути.

Пути определяются по ближайшей родительской папке с `pubspec.yaml` (инструменты Flutter) или `.git` (инструменты Git), поэтому плагин работает независимо от рабочей директории хост-процесса.

## Установка

1. Убедитесь, что **Flutter SDK** и **Git** установлены и добавлены в системный `PATH`.
2. В **DeepSeek Harness** откройте **Плагины → Добавить плагин → Локальная папка** и укажите путь к директории `dsh-flutter-helper-lite`.
3. Включите переключатель плагина в списке установленных компонентов.
4. *(Опционально)* Для работы `git_push` создайте в папке плагина файл `.env` со строкой `GITHUB_TOKEN=ваш_токен` (файл `.env` уже добавлен в `.gitignore`).

## Лицензия

MIT License