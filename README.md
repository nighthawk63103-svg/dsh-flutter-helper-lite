# dsh-flutter-helper-lite

[🇷🇺 Русская версия ниже](#-русская-версия)

**Lightweight Flutter helper plugin for DeepSeek Harness — bypasses Windows 10 PTY shell crashes and saves context/VRAM for compact local models (4B–8B).**

## Why This Plugin?

1. **Bypasses `PTY shell exited during startup` on Windows 10** — executes Flutter and Git commands directly via `cmd /c`, avoiding the broken `ConPTY / pwsh` pseudo-terminal.
2. **Saves VRAM and Context Window** — lets compact local models (`Qwen 4B–8B`) inspect large `.dart` files via a lightweight code outline instead of reading entire files.
3. **Code Safety Checkpoints** — built-in Git snapshot and rollback tools protect your project from accidental syntax breaks during AI edits.
4. **Zero External Dependencies** — uses only built-in Node.js modules (`fs`, `child_process`), requiring no `npm install` or third-party packages.

## Available Tools

* **`flutter_outline`** — extracts a `.dart` file skeleton (`class`, `void`, `Widget`, `Future<`, `State<` with line numbers) for fast navigation without context overflow.
* **`flutter_check`** — formats code (`dart format lib/`) and runs static analysis (`flutter analyze`).
* **`git_save`** — creates a Git checkpoint (`git init && git add . && git commit`) before editing files.
* **`git_undo`** — instantly reverts uncommitted changes (`git checkout -- .`) if an edit breaks compilation.
* **`git_push`** — pushes changes to the `main` branch on GitHub (reads `GITHUB_TOKEN` from a local `.env` file).
* **`flutter_build_apk`** — builds a debug Android APK (`flutter build apk --debug`).

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

1. **Обход ошибки `PTY shell exited during startup` на Windows 10** — выполняет команды Flutter и Git напрямую через `cmd /c`, минуя проблемный псевдотерминал `ConPTY / pwsh`.
2. **Экономия видеопамяти (VRAM) и контекста** — позволяет компактным локальным моделям (`Qwen 4B–8B`) изучать структуру больших `.dart`-файлов по оглавлению, не забивая память целиком.
3. **Защита от поломки кода** — встроенные точки отката Git позволяют мгновенно восстановить рабочую версию при неудачной правке.
4. **Ноль внешних зависимостей** — работает исключительно на встроенных модулях Node.js (`fs`, `child_process`), не требует установки `npm` или сторонних пакетов.

## Инструменты

* **`flutter_outline`** — извлекает «скелет» `.dart`-файла (`class`, `void`, `Widget`, `Future<`, `State<` с номерами строк) для быстрой навигации по коду.
* **`flutter_check`** — автоматически форматирует код (`dart format lib/`) и проверяет проект на ошибки (`flutter analyze`).
* **`git_save`** — создаёт контрольную точку (`git init && git add . && git commit`) перед внесением изменений.
* **`git_undo`** — мгновенно откатывает несохранённые изменения (`git checkout -- .`), если правка сломала сборку.
* **`git_push`** — отправляет изменения в ветку `main` на GitHub (читает `GITHUB_TOKEN` из локального файла `.env`).
* **`flutter_build_apk`** — собирает отладочный Android APK (`flutter build apk --debug`).

## Установка

1. Убедитесь, что **Flutter SDK** и **Git** установлены и добавлены в системный `PATH`.
2. В **DeepSeek Harness** откройте **Плагины → Добавить плагин → Локальная папка** и укажите путь к директории `dsh-flutter-helper-lite`.
3. Включите переключатель плагина в списке установленных компонентов.
4. *(Опционально)* Для работы `git_push` создайте в папке плагина файл `.env` со строкой `GITHUB_TOKEN=ваш_токен` (файл `.env` уже добавлен в `.gitignore`).

## Лицензия

MIT License