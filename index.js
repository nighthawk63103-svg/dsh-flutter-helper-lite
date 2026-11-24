// Flutter Helper Bundle - registers host plugin tools for Flutter and Git.
// Zero external dependencies: built-in Node.js modules only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this module, never from raw Windows strings.
// import.meta.url is a file:// URL; fileURLToPath converts it to a native path.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IS_WINDOWS = process.platform === 'win32';
const PUBSPEC = 'pubspec.yaml';
const GIT_DIR = '.git';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

// Strict allowlist for the run_script tool. A map of public script name to the
// project-relative file path, so a model-supplied string can never become an
// arbitrary command. Existing root-level scripts keep their exact names; the
// phase 0A tooling lives under scripts/.
const ALLOWED_SCRIPTS = Object.freeze({
  'check_and_test.bat': 'check_and_test.bat',
  'build_apk.bat': 'build_apk.bat',
  'backup_git.bat': 'backup_git.bat',
  'project_map.bat': 'project_map.bat',
  'symbols_map.bat': 'symbols_map.bat',
  'fast_check.bat': 'fast_check.bat',
  'git_diff_summary.bat': 'git_diff_summary.bat',
  'context_pack.bat': 'context_pack.bat',
  'autofix.bat': 'autofix.bat',
  'release_all.bat': 'release_all.bat',
  spec_tracker: 'scripts/spec_tracker.bat',
  gen_model_parts: 'scripts/gen_model_parts.bat',
  gen_service_stub: 'scripts/gen_service_stub.bat',
  gen_test_skeletons: 'scripts/gen_test_skeletons.bat',
  check_sqlite_isolation: 'scripts/check_sqlite_isolation.bat',
  check_protected_files: 'scripts/check_protected_files.bat',
  state_snapshot: 'scripts/state_snapshot.bat',
  test_failures: 'scripts/test_failures.bat',
  scope_guard: 'scripts/scope_guard.bat',
  api_outline: 'scripts/api_outline.bat',
  gen_docs: 'scripts/gen_docs.bat',
  bump_version: 'scripts/bump_version.bat',
});

// Public names in a stable order for the tool description and error messages.
const SCRIPT_NAMES = Object.freeze(Object.keys(ALLOWED_SCRIPTS));

// Generator scripts whose .bat understands --dry-run. run_script forwards the
// optional dryRun flag for these two only, so no other script ever receives an
// argument it does not parse (an unknown flag makes those scripts exit 1).
const DRY_RUN_SCRIPTS = Object.freeze(['gen_docs', 'gen_model_parts']);

// v1.8.0: accept a script name with or without the ".bat" suffix. The frozen
// map above keeps its historical keys (nothing is removed for backward
// compatibility); aliases only add lookup forms, so "gen_docs" and
// "gen_docs.bat" both resolve to the same canonical allowlist entry.
const SCRIPT_ALIASES = (() => {
  const map = new Map();
  for (const name of SCRIPT_NAMES) {
    const bare = name.replace(/\.bat$/i, '');
    map.set(name, name);
    map.set(bare, name);
    map.set(`${bare}.bat`, name);
  }
  return map;
})();

const ACCEPTED_SCRIPT_NAMES = Object.freeze([...SCRIPT_ALIASES.keys()]);

// Resolve any accepted spelling to its canonical allowlist key, or null.
function resolveScriptName(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (SCRIPT_ALIASES.has(raw)) return SCRIPT_ALIASES.get(raw);
  return SCRIPT_ALIASES.get(raw.toLowerCase()) || null;
}

// The project .gitignore excludes plugins/, so the two plugin sources that make
// up this tooling bundle need an explicit forced add when committing them.
// This is a fixed list: no other file (notably .env) can be force-added.
const PLUGIN_TOOLING_FILES = Object.freeze([
  'plugins/flutter-helper/index.js',
  'plugins/flutter-helper/package.json',
]);

// Keep tool output tiny: model context is far more expensive than log loss.
const MAX_RESULT_CHARS = 4000;

// ---------------------------------------------------------------------------
// Optional plugin-local environment (.env)
// ---------------------------------------------------------------------------

// Load the optional plugin-local .env (e.g. GITHUB_TOKEN) using a resolved
// path, so it works no matter where the project or plugin is installed.
// A missing or unreadable .env is never an error.
function loadPluginEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/.exec(trimmed);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      const quoted = value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
         (value.startsWith("'") && value.endsWith("'")));
      if (quoted) {
        value = value.slice(1, -1);
      } else {
        // Strip an unquoted trailing comment: KEY=value # comment
        value = value.replace(/\s+#.*$/, '').trim();
      }
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional: never crash the plugin when it is missing.
  }
}

loadPluginEnv();

function getGithubToken() {
  return String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
}

// Never leak credentials into tool output (and therefore into the model
// context or logs). Covers the raw token and URL userinfo.
function redact(value) {
  let text = String(value ?? '');
  const token = getGithubToken();
  if (token) text = text.split(token).join('***');
  text = text.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1***@');
  return text;
}

// ---------------------------------------------------------------------------
// Project discovery
// ---------------------------------------------------------------------------

function normalizeStartPath(startPath) {
  const raw = typeof startPath === 'string' ? startPath.trim() : '';
  if (!raw) return process.cwd();
  let resolved = path.resolve(process.cwd(), raw);
  try {
    if (!fs.statSync(resolved).isDirectory()) resolved = path.dirname(resolved);
  } catch {
    // The path does not exist yet: treat it as a file unless it clearly
    // denotes a directory (trailing separator).
    if (!/[\\/]$/.test(raw)) resolved = path.dirname(resolved);
  }
  return resolved;
}

/**
 * Walk upwards from a file/directory path (or process.cwd()) and return the
 * nearest directory containing one of the markers.
 *
 * @param {string} [startPath] File or directory to start from.
 * @param {string|string[]} [markers] Marker file/dir names, default pubspec.yaml.
 * @returns {string|null} Absolute project root, or null when none was found.
 */
export function findProjectRoot(startPath, markers = [PUBSPEC]) {
  const wanted = (Array.isArray(markers) ? markers : [markers]).filter(Boolean);
  if (wanted.length === 0) return null;
  let current = normalizeStartPath(startPath);
  while (true) {
    for (const marker of wanted) {
      if (fs.existsSync(path.join(current, marker))) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null; // reached the filesystem root
    current = parent;
  }
}

// Resolve a root from the given path first, then from the process working
// directory, then from the plugin location (useful when the host runs tools
// with an unrelated cwd). The plugin lives inside the project it serves.
function findRoot(filePath, markers) {
  const starts = [];
  if (typeof filePath === 'string' && filePath.trim()) starts.push(filePath);
  starts.push(process.cwd());
  starts.push(__dirname);
  for (const start of starts) {
    const root = findProjectRoot(start, markers);
    if (root) return root;
  }
  return null;
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

// Resolve the Dart file a tool should work on. Paths are relative to the
// Flutter project root; a bare "main.dart" also resolves to lib/main.dart so
// both calling conventions keep working.
function resolveDartFile(filePath, root) {
  const raw = typeof filePath === 'string' ? filePath.trim() : '';
  if (!raw) return null;
  const primary = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(root, raw);
  const candidates = [primary];
  if (!path.isAbsolute(raw)) candidates.push(path.resolve(root, 'lib', raw));
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate;
  }
  return primary;
}

// True when `target` is not inside `root` (equal paths count as inside).
function isOutside(root, target) {
  const relative = path.relative(root, target);
  return relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);
}

// Convert a user-supplied path into a git pathspec that stays inside the repo.
// Returns "." for the repo root, or null when the path escapes the repository.
function repoRelative(targetPath, repoRoot) {
  const raw = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!raw) return null;
  const absolute = path.resolve(repoRoot, raw);
  if (isOutside(repoRoot, absolute)) return null;
  const relative = path.relative(repoRoot, absolute);
  if (!relative) return '.';
  return relative.split(path.sep).join('/');
}

function displayPath(absolutePath, root) {
  if (isOutside(root, absolutePath)) return absolutePath;
  const relative = path.relative(root, absolutePath);
  if (!relative) return absolutePath;
  return relative.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

// Quote one argument for the cmd.exe command line used to launch .bat shims.
// Windows file names cannot contain double quotes; "%", CR and LF would be
// expanded/interpreted by cmd.exe, so they are rejected explicitly.
function quoteForCmd(value) {
  const text = String(value);
  if (/[\r\n"]/.test(text)) {
    throw new Error('Command arguments must not contain quotes or line breaks.');
  }
  if (text.includes('%')) {
    throw new Error('Command arguments must not contain "%" because cmd.exe would expand it.');
  }
  if (text === '') return '""';
  if (!/[\s&|<>^()!]/.test(text)) return text;
  return `"${text}"`;
}

function combineOutput(stdout, stderr) {
  return [stdout, stderr]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

// Return the trimmed tail of `value`, capped at `limit` characters. The head is
// dropped because the end of a build/test log carries the actionable result.
function tailText(value, limit = MAX_RESULT_CHARS) {
  const text = String(value ?? '').trim();
  if (text.length <= limit) return text;
  return `...[truncated, last ${limit} chars]\n${text.slice(-limit)}`;
}

// Spawn a process, capture its output and enforce a timeout. Never throws.
function runProcess(file, args, options = {}) {
  const { cwd, env, timeout = DEFAULT_TIMEOUT_MS, verbatim = false } = options;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, {
        cwd,
        env,
        windowsHide: true,
        windowsVerbatimArguments: Boolean(verbatim),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ ok: false, output: redact(error.message || String(error)) });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer = null;
    let settled = false;

    const append = (current, chunk) => {
      if (current.length >= MAX_OUTPUT_BYTES) return current;
      return current + chunk.toString('utf8');
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ ...result, output: redact(result.output) });
    };

    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });

    child.on('error', (error) => {
      finish({ ok: false, output: error.message || String(error) });
    });

    child.on('close', (code, signal) => {
      const output = combineOutput(stdout, stderr);
      if (timedOut) {
        finish({
          ok: false,
          output: `${output ? `${output}\n\n` : ''}Command timed out after ${Math.round(timeout / 1000)}s and was terminated.`,
        });
        return;
      }
      if (code === 0) {
        finish({ ok: true, output: output || '(no output)' });
        return;
      }
      finish({
        ok: false,
        output: output || `Command exited with code ${code}${signal ? ` (signal ${signal})` : ''}.`,
      });
    });

    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
  });
}

// Run a CLI tool with an explicit cwd. flutter/dart are .bat shims on Windows,
// so they are launched through cmd.exe with a verbatim, pre-quoted command
// line; everything else (notably git.exe) is spawned directly without a shell.
async function runCommand(command, args = [], options = {}) {
  const { cwd, env, timeout = DEFAULT_TIMEOUT_MS } = options;

  let file = command;
  let spawnArgs = args;
  let verbatim = false;

  try {
    if (IS_WINDOWS && /^(?:dart|flutter)(?:\.(?:bat|cmd))?$/i.test(command)) {
      file = process.env.ComSpec || 'cmd.exe';
      spawnArgs = ['/d', '/s', '/c', [command, ...args].map(quoteForCmd).join(' ')];
      verbatim = true;
    }
  } catch (error) {
    return { ok: false, output: redact(error.message) };
  }

  const spawnEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    ...(env || {}),
  };

  return runProcess(file, spawnArgs, { cwd, env: spawnEnv, timeout, verbatim });
}

// ---------------------------------------------------------------------------
// Security and summary gates (v1.8.0)
// ---------------------------------------------------------------------------

// Patterns the root .gitignore must keep ignoring. Mirrors the policy recorded
// in docs/decisions/ADR-0001-keystore.md.
const REQUIRED_GITIGNORE_PATTERNS = Object.freeze([
  '*.jks',
  '*.keystore',
  'key.properties',
  '.dart_tool/',
  'build/',
]);

// Path patterns that must never appear in git history.
const DEFAULT_SECRET_PATTERNS = Object.freeze([
  '*.jks',
  '*.keystore',
  'key.properties',
  'upload-keystore.jks',
]);

// A gate tool reports failure the way a command reports a non-zero exit: the
// body stays exactly the documented text, but the call is surfaced as failed.
function gateResult(text, failed) {
  if (failed) throw new Error(text);
  return text;
}

// Compare .gitignore lines without care for trailing slashes or Windows
// separators, so "build/" and "build" both satisfy the "build/" requirement.
function normalizeIgnoreLine(line) {
  return String(line ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
}

// Match one history path against a simple pattern: "*.ext" is a suffix test,
// anything else is a full-path or basename test.
function matchesPathPattern(file, pattern) {
  const wanted = String(pattern ?? '').trim();
  if (!wanted) return false;
  const name = path.posix.basename(file);
  if (wanted.startsWith('*')) {
    return name.toLowerCase().endsWith(wanted.slice(1).toLowerCase());
  }
  return file === wanted || name === wanted;
}

function firstLines(value, limit) {
  return String(value ?? '').split(/\r?\n/).filter((line) => line.trim()).slice(0, limit);
}

function lastLines(value, limit) {
  return String(value ?? '').split(/\r?\n/).filter((line) => line.trim()).slice(-limit);
}

// Pick the diff base: explicit baseRef, then config.base, then each
// baseFallback entry, then the repository's first commit.
async function resolveBaseCommit(cwd, config, baseRef) {
  const fallbacks = Array.isArray(config?.baseFallback) ? config.baseFallback : [];
  const candidates = [baseRef, config?.base, ...fallbacks]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());

  for (const candidate of candidates) {
    const verify = await runCommand('git', ['rev-parse', '--verify', '--quiet', candidate], { cwd });
    if (!verify.ok) continue;
    const resolved = lastLines(verify.output, 1)[0];
    if (resolved) return resolved;
  }

  const roots = await runCommand('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd });
  if (!roots.ok) return null;
  const first = String(roots.output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return first.length > 0 ? first[first.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Tool output helpers
// ---------------------------------------------------------------------------

// Every tool returns a canonical string; renderer maps it to model-facing text.
const textOutput = {
  schema: { type: 'string' },
  render: (_args, value) => [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
};

const filePathParameters = {
  type: 'object',
  properties: {
    filePath: {
      type: 'string',
      description: 'Path to the file, relative to the Flutter project',
    },
  },
  required: ['filePath'],
  additionalProperties: false,
};

const optionalFilePathParameters = {
  type: 'object',
  properties: {
    filePath: {
      type: 'string',
      description: 'Optional path inside the git repository; omit it to cover the whole repository',
    },
  },
  additionalProperties: false,
};

// git_save additionally accepts an explicit commit subject. Keeping it
// optional preserves the historical "checkpoint" behaviour.
const commitParameters = {
  type: 'object',
  properties: {
    ...optionalFilePathParameters.properties,
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional repository-relative paths to stage instead of all changes.',
    },
    message: {
      type: 'string',
      description: 'Optional commit subject; defaults to "checkpoint".',
    },
  },
  additionalProperties: false,
};

const noParameters = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

// Declarations worth showing in the low-context outline. Anchored at the start
// of the trimmed line so comments and ordinary expressions do not match.
const OUTLINE_PATTERNS = [
  /^(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:abstract|base|final|interface|sealed)\s+)*(?:mixin\s+class|mixin|class|enum|extension|typedef)\s+[\w$]+/,
  /^(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:static\s+|final\s+|const\s+|late\s+|external\s+|abstract\s+|factory\s+|covariant\s+)*(?:void|Future(?:<[^>]*>)?|Stream(?:<[^>]*>)?|Widget|State(?:<[^>]*>)?|StatefulWidget|StatelessWidget)\??\s+[\w$]+\s*[(<]/,
];

function findBuiltApk(root) {
  const outputDir = path.join(root, 'build', 'app', 'outputs', 'flutter-apk');
  const preferred = path.join(outputDir, 'app-release.apk');
  if (isFile(preferred)) return preferred;
  try {
    const apks = fs.readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith('.apk'))
      .map((name) => path.join(outputDir, name))
      .filter((candidate) => isFile(candidate));
    if (apks.length === 0) return null;
    apks.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return apks[0];
  } catch {
    return null;
  }
}

function resolveApkDestination(outputPath, root, artifact) {
  const raw = typeof outputPath === 'string' ? outputPath.trim() : '';
  if (!raw) return artifact;
  let target = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(root, raw);
  if (!/\.apk$/i.test(target)) target = path.join(target, path.basename(artifact));
  return target;
}

export const inject = ['tools'];

export function apply(ctx, _config) {
  // Flutter outline: file skeleton with line numbers for low-context inspection.
  ctx.tools.register({
    name: 'flutter_outline',
    description: 'Extract class, void, Widget, Future<, and State< declarations with line numbers from a .dart file.',
    parameters: filePathParameters,
    output: textOutput,
    execute: async ({ filePath } = {}) => {
      const root = findRoot(filePath, [PUBSPEC]) || process.cwd();
      const file = resolveDartFile(filePath, root);
      if (!file) return 'Error: filePath is required.';
      if (!isFile(file)) return `Error: file not found: ${displayPath(file, root)}`;
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split(/\r?\n/);
        const result = [];
        let inBlockComment = false;

        for (let index = 0; index < lines.length; index += 1) {
          const trimmed = lines[index].trim();
          if (inBlockComment) {
            if (trimmed.includes('*/')) inBlockComment = false;
            continue;
          }
          if (trimmed.startsWith('/*')) {
            if (!trimmed.includes('*/')) inBlockComment = true;
            continue;
          }
          if (!trimmed || trimmed.startsWith('//')) continue;
          if (OUTLINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
            result.push(`Line ${index + 1}: ${trimmed}`);
          }
        }

        return result.length > 0 ? result.join('\n') : 'No matching declarations found.';
      } catch (error) {
        return `Error reading file: ${error.message}`;
      }
    },
  });

  // Format the given file and run static analysis in the Flutter project root.
  ctx.tools.register({
    name: 'flutter_check',
    description: 'Format code with dart format and analyze with flutter analyze.',
    parameters: filePathParameters,
    output: textOutput,
    execute: async ({ filePath } = {}) => {
      const raw = typeof filePath === 'string' ? filePath.trim() : '';
      if (!raw) return 'Error: filePath is required.';

      const root = findRoot(raw, [PUBSPEC]);
      if (!root) {
        return 'Error: no pubspec.yaml found upwards from the given path or the current directory.';
      }

      const file = resolveDartFile(raw, root);
      if (!file || !isFile(file)) {
        return `Error: file not found: ${file || raw} (Flutter project root: ${root}).`;
      }

      const relativeFile = displayPath(file, root);
      const format = await runCommand('dart', ['format', file], {
        cwd: root,
        timeout: 5 * 60 * 1000,
      });
      // Analysis still runs when formatting fails, so both problems are visible.
      const analyze = await runCommand('flutter', ['analyze'], {
        cwd: root,
        timeout: 15 * 60 * 1000,
      });

      const report = [
        `# dart format ${relativeFile}`,
        format.output,
        '',
        '# flutter analyze',
        analyze.output,
      ].join('\n');

      return format.ok && analyze.ok ? report : `One or more checks failed.\n\n${report}`;
    },
  });

  // Create a Git checkpoint before editing.
  ctx.tools.register({
    name: 'git_save',
    description: 'Save all changes to the git repository with the commit message "checkpoint".',
    parameters: commitParameters,
    output: textOutput,
    execute: async ({ filePath, message, paths } = {}) => {
      const raw = typeof filePath === 'string' ? filePath.trim() : '';
      const repo = findRoot(raw || undefined, [GIT_DIR]);
      if (!repo) {
        return 'Error: no .git directory found upwards from the given path or the current directory. ' +
          'Run "git init" in the project root first.';
      }

      const target = raw ? repoRelative(raw, repo) : null;
      if (raw && !target) {
        return `Error: ${raw} is outside the git repository ${repo}.`;
      }

      // Optional explicit pathspecs keep a commit scoped to the intended
      // directories even when unrelated files are untracked.
      const requested = Array.isArray(paths)
        ? paths.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())
        : [];
      const specs = [];
      for (const entry of requested) {
        const relative = repoRelative(entry, repo);
        if (!relative) return `Error: ${entry} is outside the git repository ${repo}.`;
        specs.push(relative);
      }

      const commitMessage = typeof message === 'string' && message.trim()
        ? message.trim()
        : 'checkpoint';

      // The plugin sources are deliberately gitignored, so a normal `git add`
      // would skip them. Force-add only the fixed allowlist above.
      const forcePluginFiles = target === 'plugins/flutter-helper' ||
        PLUGIN_TOOLING_FILES.includes(target) ||
        specs.some((spec) => PLUGIN_TOOLING_FILES.includes(spec));
      let add;
      if (forcePluginFiles) {
        add = await runCommand('git', ['add', '-f', '--', ...PLUGIN_TOOLING_FILES], { cwd: repo });
      } else if (specs.length > 0) {
        add = await runCommand('git', ['add', '-A', '--', ...specs], { cwd: repo });
      } else {
        add = await runCommand('git', target ? ['add', '-A', '--', target] : ['add', '-A'], { cwd: repo });
      }
      if (!add.ok) return `git add failed in ${repo}.\n${add.output}`;

      let commit = await runCommand('git', ['commit', '-m', commitMessage], { cwd: repo });
      if (!commit.ok && /author identity unknown|tell me who you are|unable to auto-detect email|empty ident/i.test(commit.output)) {
        // A fresh machine often has no user.name/user.email configured; use a
        // local fallback for this single commit instead of failing the tool.
        commit = await runCommand('git', [
          '-c', 'user.name=flutter-helper',
          '-c', 'user.email=flutter-helper@localhost',
          'commit', '-m', commitMessage,
        ], { cwd: repo });
      }

      if (!commit.ok) {
        if (/nothing to commit|no changes added to commit|working tree clean/i.test(commit.output)) {
          return `Nothing to commit in ${repo} (the working tree is already clean).`;
        }
        return `git commit failed in ${repo}.\n${commit.output}`;
      }

      return `Checkpoint created in ${repo}.\n\n${commit.output}`;
    },
  });

  // Revert uncommitted changes if an edit breaks the build.
  ctx.tools.register({
    name: 'git_undo',
    description: 'Undo all uncommitted git changes.',
    parameters: optionalFilePathParameters,
    output: textOutput,
    execute: async ({ filePath } = {}) => {
      const raw = typeof filePath === 'string' ? filePath.trim() : '';
      const repo = findRoot(raw || undefined, [GIT_DIR]);
      if (!repo) {
        return 'Error: no .git directory found upwards from the given path or the current directory.';
      }

      if (raw) {
        const target = repoRelative(raw, repo);
        if (!target) return `Error: ${raw} is outside the git repository ${repo}.`;

        // Best effort: unstage the path. This fails harmlessly before the
        // repository has its first commit.
        await runCommand('git', ['reset', '-q', 'HEAD', '--', target], { cwd: repo });

        const restore = await runCommand('git', ['checkout', '--', target], { cwd: repo });
        if (!restore.ok) {
          if (/did not match any file|pathspec .* did not match/i.test(restore.output)) {
            return `Nothing to restore for ${target}: it is not tracked by Git. The file was left untouched.`;
          }
          return `git checkout failed for ${target}.\n${restore.output}`;
        }
        return `Restored ${target} from HEAD in ${repo}.`;
      }

      const head = await runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repo });
      if (!head.ok) return `Repository ${repo} has no commits yet; nothing to undo.`;

      const reset = await runCommand('git', ['reset', '--hard', 'HEAD'], { cwd: repo });
      if (!reset.ok) return `git reset --hard failed in ${repo}.\n${reset.output}`;

      return `Reverted all tracked changes in ${repo}. Untracked files were left untouched.\n\n${reset.output}`;
    },
  });

  // Push changes to the current branch of origin (main or master, whichever
  // the repository actually uses).
  ctx.tools.register({
    name: 'git_push',
    description: 'Push all changes to the GitHub repository.',
    parameters: noParameters,
    output: textOutput,
    execute: async () => {
      const repo = findRoot(undefined, [GIT_DIR]);
      if (!repo) {
        return 'Error: no .git directory found upwards from the current directory. ' +
          'Initialize a repository and configure an "origin" remote first.';
      }

      const branchResult = await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo });
      if (!branchResult.ok) return `Could not determine the current branch in ${repo}.\n${branchResult.output}`;

      const branch = branchResult.output.split('\n')[0].trim();
      if (!branch || branch === 'HEAD') {
        return `Detached HEAD in ${repo}; switch to a branch before pushing.`;
      }

      const remote = await runCommand('git', ['remote', 'get-url', 'origin'], { cwd: repo });
      if (!remote.ok) {
        return `No "origin" remote configured in ${repo}. Add one with:\n  git remote add origin <url>`;
      }

      const remoteUrl = remote.output.split('\n')[0].trim();
      const token = getGithubToken();
      const args = ['push', '--set-upstream', 'origin', branch];

      if (token && /^https?:\/\//i.test(remoteUrl)) {
        // Feed the token through a credential helper so it never appears in
        // argv, git output, logs or the model context. The helper reads the
        // token from the plugin .env (already merged into process.env).
        args.unshift(
          '-c',
          'credential.helper=!f() { test "$1" = get && echo username=x-access-token && echo password=$GITHUB_TOKEN; }; f',
        );
      }

      const push = await runCommand('git', args, { cwd: repo, timeout: 10 * 60 * 1000 });
      if (!push.ok) {
        const authFailure = /authentication failed|could not read username|terminal prompts disabled|permission denied|403|401/i.test(push.output);
        let hint = '';
        if (authFailure) {
          hint = token
            ? '\n\nGitHub rejected the credentials. Check GITHUB_TOKEN in plugins/flutter-helper/.env.'
            : '\n\nNo GITHUB_TOKEN found. Create plugins/flutter-helper/.env with GITHUB_TOKEN=<token>, or use an SSH remote.';
        } else if (!token) {
          hint = '\n\nNo GITHUB_TOKEN found. Create plugins/flutter-helper/.env with GITHUB_TOKEN=<token>, or use an SSH remote.';
        }
        return `git push failed in ${repo}.\n${push.output}${hint}`;
      }

      return `Pushed branch "${branch}" to origin in ${repo}.\n\n${push.output}`;
    },
  });

  // Build a release Android APK and copy it to the requested path.
  ctx.tools.register({
    name: 'flutter_build_apk',
    description: 'Build an Android APK with flutter build apk.',
    parameters: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Path where the APK is written (absolute, or relative to the Flutter project root)',
        },
      },
      required: ['outputPath'],
      additionalProperties: false,
    },
    output: textOutput,
    execute: async ({ outputPath } = {}) => {
      const root = findRoot(undefined, [PUBSPEC]);
      if (!root) {
        return 'Error: no pubspec.yaml found upwards from the current directory.';
      }

      const build = await runCommand('flutter', ['build', 'apk', '--release'], {
        cwd: root,
        timeout: BUILD_TIMEOUT_MS,
      });
      if (!build.ok) return `flutter build apk failed in ${root}.\n\n${build.output}`;

      const artifact = findBuiltApk(root);
      if (!artifact) {
        return `Build finished but no APK was found under ${path.join('build', 'app', 'outputs', 'flutter-apk')}.\n\n${build.output}`;
      }

      const raw = typeof outputPath === 'string' ? outputPath.trim() : '';
      if (!raw) {
        return `APK built at ${artifact} (no outputPath given, so it was left in place).\n\n${build.output}`;
      }

      const target = resolveApkDestination(raw, root, artifact);
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(artifact, target);
      } catch (error) {
        return `Build succeeded but copying the APK to ${target} failed: ${error.message}`;
      }

      const sizeMb = (fs.statSync(target).size / (1024 * 1024)).toFixed(1);
      return `APK built and copied to ${target} (${sizeMb} MB).\n\n${build.output}`;
    },
  });

  // Run one of the project's own helper scripts. The script name is checked
  // against a strict allowlist, so this can never become arbitrary execution.
  ctx.tools.register({
    name: 'run_script',
    description: 'Run an allowlisted project helper .bat script from the Flutter project root and return the tail of its output. Script names are accepted with or without the ".bat" suffix.',
    parameters: {
      type: 'object',
      properties: {
        scriptName: {
          type: 'string',
          description: `Exact script name, one of: ${SCRIPT_NAMES.join(', ')} (the ".bat" suffix is optional)`,
          enum: [...ACCEPTED_SCRIPT_NAMES],
        },
        compact: {
          type: 'boolean',
          description: 'When true, keep only the last 5 lines of stdout instead of the default tail.',
        },
        dryRun: {
          type: 'boolean',
          description: 'When true, forward --dry-run to gen_docs or gen_model_parts; other scripts reject it.',
        },
      },
      required: ['scriptName'],
      additionalProperties: false,
    },
    output: textOutput,
    execute: async ({ scriptName, compact, dryRun } = {}) => {
      const raw = typeof scriptName === 'string' ? scriptName.trim() : '';
      if (!raw) {
        return `Error: scriptName is required. Allowed: ${SCRIPT_NAMES.join(', ')}.`;
      }

      // Resolve the historical name and the optional ".bat" alias to exactly
      // one canonical allowlist key. No model-supplied text reaches the path.
      const canonical = resolveScriptName(raw);
      if (!canonical) {
        return `Error: "${raw}" is not an allowed script. Allowed: ${SCRIPT_NAMES.join(', ')}.`;
      }

      // Optional generator dry-run. Only the two scripts that document the
      // flag get it; anything else would exit 1 on an unknown argument.
      const extraArgs = [];
      if (dryRun === true) {
        if (!DRY_RUN_SCRIPTS.includes(canonical)) {
          return `Error: dryRun is only supported for: ${DRY_RUN_SCRIPTS.join(', ')}.`;
        }
        extraArgs.push('--dry-run');
      }

      const root = findRoot(undefined, [PUBSPEC]);
      if (!root) {
        return 'Error: no pubspec.yaml found upwards from the current directory.';
      }

      const relativeScript = ALLOWED_SCRIPTS[canonical];
      const scriptPath = path.join(root, relativeScript);
      if (!isFile(scriptPath)) {
        return `Error: script not found: ${displayPath(scriptPath, root)} (project root: ${root}).`;
      }

      // The map value is a constant relative path; no model-supplied text ever
      // reaches the command line. cmd.exe resolves the absolute path directly.
      const run = await runProcess(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/c', scriptPath, ...extraArgs],
        {
          cwd: root,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
          timeout: DEFAULT_TIMEOUT_MS,
        },
      );

      const body = compact === true
        ? (lastLines(run.output, 5).join('\n') || '(no output)')
        : tailText(run.output);
      if (!run.ok) {
        return `Script ${canonical} failed in ${root}.\n\n${body}`;
      }
      return `Script ${canonical} finished in ${root}.\n\n${body}`;
    },
  });

  // --- v1.8.0 gates -------------------------------------------------------

  // Verify that the root .gitignore still hides signing secrets and build
  // output. Five required patterns, at most five MISSING lines.
  ctx.tools.register({
    name: 'check_gitignore',
    description: 'Verify the repository .gitignore still ignores signing secrets and build output.',
    parameters: {
      type: 'object',
      properties: {
        gitignorePath: {
          type: 'string',
          description: 'Optional path to a .gitignore file or to the project root; defaults to the Flutter project root',
        },
      },
      additionalProperties: false,
    },
    output: textOutput,
    execute: async ({ gitignorePath } = {}) => {
      const raw = typeof gitignorePath === 'string' ? gitignorePath.trim() : '';
      // The plugin can be installed from inside the project (plugins/<name>),
      // so anchor on pubspec.yaml first: that is the app root, not the nested
      // plugin repository, and the required patterns belong to the app root.
      const root = findRoot(raw || undefined, [PUBSPEC]) || process.cwd();
      let file = path.resolve(root, raw || '.gitignore');
      if (raw && fs.existsSync(file) && !isFile(file)) file = path.join(file, '.gitignore');

      let lines = [];
      if (isFile(file)) {
        try {
          lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
        } catch (error) {
          throw new Error(`Error: cannot read ${displayPath(file, root)}: ${error.message}`);
        }
      }

      const present = new Set(lines.map(normalizeIgnoreLine));
      const missing = REQUIRED_GITIGNORE_PATTERNS.filter((pattern) => !present.has(normalizeIgnoreLine(pattern)));
      return gateResult(
        missing.length === 0
          ? 'OK'
          : firstLines(missing.map((pattern) => `MISSING: ${pattern}`), 5).join('\n'),
        missing.length > 0,
      );
    },
  });

  // Check that a diff against the configured base never touches protected
  // Flutter screens. The base comes from docs/protected.json with a fallback.
  ctx.tools.register({
    name: 'check_diff_paths',
    description: 'Check that the current diff against the configured base does not touch protected files.',
    parameters: {
      type: 'object',
      properties: {
        configPath: {
          type: 'string',
          description: 'Optional path to the protected-paths config; defaults to docs/protected.json',
        },
        baseRef: {
          type: 'string',
          description: 'Optional git ref to diff against; defaults to the configured base',
        },
      },
      additionalProperties: false,
    },
    output: textOutput,
    execute: async ({ configPath, baseRef } = {}) => {
      const rawBase = typeof baseRef === 'string' ? baseRef.trim() : '';
      // Prefer the app root (pubspec.yaml) over the nested plugin repository:
      // from plugins/<name> the nearest .git is the plugin's own repo.
      const repo = findRoot(undefined, [PUBSPEC]) || findRoot(undefined, [GIT_DIR]);
      if (!repo) return 'Error: no .git directory found upwards from the current directory.';

      const configFile = typeof configPath === 'string' && configPath.trim()
        ? path.resolve(repo, configPath.trim())
        : path.join(repo, 'docs', 'protected.json');

      let config;
      try {
        config = JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
      } catch (error) {
        throw new Error(`Error: cannot read ${displayPath(configFile, repo)}: ${error.message}`);
      }

      const protectedPaths = Array.isArray(config?.protected)
        ? config.protected
          .filter((value) => typeof value === 'string' && value.trim())
          .map((value) => value.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
        : [];
      if (protectedPaths.length === 0) {
        throw new Error(`Error: no protected paths declared in ${displayPath(configFile, repo)}.`);
      }

      const base = await resolveBaseCommit(repo, config, rawBase);
      if (!base) throw new Error('Error: could not resolve a git base commit to diff against.');

      const diff = await runCommand(
        'git',
        ['-c', 'core.quotepath=false', 'diff', '--name-only', `${base}..HEAD`],
        { cwd: repo },
      );
      if (!diff.ok) throw new Error(`Error: git diff against ${base} failed.\n${lastLines(diff.output, 5).join('\n')}`);

      const touched = String(diff.output)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((file) => protectedPaths.some((p) => file === p || file.startsWith(`${p}/`)));

      return gateResult(
        touched.length === 0 ? 'OK' : firstLines(touched.map((file) => `TOUCHED: ${file}`), 3).join('\n'),
        touched.length > 0,
      );
    },
  });

  // Reduce the full flutter test log to one compact summary line.
  ctx.tools.register({
    name: 'flutter_test_summary',
    description: 'Run flutter test and report only "Passed: N, Failed: M, Skipped: K".',
    parameters: noParameters,
    output: textOutput,
    execute: async () => {
      const root = findRoot(undefined, [PUBSPEC]);
      if (!root) return 'Error: no pubspec.yaml found upwards from the current directory.';

      const run = await runCommand('flutter', ['test', '--reporter', 'compact'], {
        cwd: root,
        timeout: 30 * 60 * 1000,
      });

      // The compact reporter rewrites one line with carriage returns, so split
      // on both CR and LF before looking for the newest progress line.
      const progress = String(run.output)
        .split(/\r\n|\r|\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d+:\d+\s/.test(line) && /\+\d+/.test(line));
      const summary = progress.length > 0 ? progress[progress.length - 1] : '';
      const counts = /\+(\d+)(?:\s+-(\d+))?(?:\s+~(\d+))?/.exec(summary);
      if (!counts) {
        throw new Error('Error: could not parse the flutter test compact reporter output.');
      }

      const passed = Number(counts[1] || 0);
      const failed = Number(counts[2] || 0);
      const skipped = Number(counts[3] || 0);
      return gateResult(`Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`, failed > 0 || !run.ok);
    },
  });

  // Bump the app version by delegating to the project script. No versioning
  // logic lives in the plugin.
  ctx.tools.register({
    name: 'version_bump',
    description: 'Run the project version bump script for major, minor or patch.',
    parameters: {
      type: 'object',
      properties: {
        arg: {
          type: 'string',
          description: 'Which version component to bump',
          enum: ['major', 'minor', 'patch'],
        },
        dryRun: {
          type: 'boolean',
          description: 'Forward --dry-run to the project script when it supports it',
        },
      },
      required: ['arg'],
      additionalProperties: false,
    },
    output: textOutput,
    execute: async ({ arg, dryRun } = {}) => {
      const value = typeof arg === 'string' ? arg.trim().toLowerCase() : '';
      if (!['major', 'minor', 'patch'].includes(value)) {
        throw new Error('Error: arg must be one of major, minor, patch.');
      }

      const root = findRoot(undefined, [PUBSPEC]);
      if (!root) return 'Error: no pubspec.yaml found upwards from the current directory.';

      const scriptPath = path.join(root, 'scripts', 'bump_version.bat');
      if (!isFile(scriptPath)) {
        return `Error: script not found: ${displayPath(scriptPath, root)}.`;
      }

      const args = ['/d', '/c', scriptPath, value];
      if (dryRun === true) args.push('--dry-run');

      const run = await runProcess(
        process.env.ComSpec || 'cmd.exe',
        args,
        { cwd: root, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: DEFAULT_TIMEOUT_MS },
      );

      const body = lastLines(run.output, 5).join('\n') || '(no output)';
      return `${body}\nExit code: ${run.ok ? 0 : 1}`;
    },
  });

  // Scan all refs for secret filenames that were ever committed.
  ctx.tools.register({
    name: 'git_secret_scan',
    description: 'Scan git history for committed signing secrets and report where they first appeared.',
    parameters: {
      type: 'object',
      properties: {
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional path patterns; defaults to *.jks, *.keystore, key.properties, upload-keystore.jks',
        },
      },
      additionalProperties: false,
    },
    output: textOutput,
    execute: async ({ patterns } = {}) => {
      const repo = findRoot(undefined, [PUBSPEC]) || findRoot(undefined, [GIT_DIR]);
      if (!repo) return 'Error: no .git directory found upwards from the current directory.';

      const wanted = (Array.isArray(patterns) ? patterns : [])
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim());
      const active = wanted.length > 0 ? wanted : [...DEFAULT_SECRET_PATTERNS];

      const scan = await runCommand(
        'git',
        ['log', '--all', '--full-history', '--name-only', '--pretty=format:%H'],
        { cwd: repo, timeout: 10 * 60 * 1000 },
      );
      if (!scan.ok) throw new Error(`Error: git log scan failed.\n${lastLines(scan.output, 5).join('\n')}`);

      // Walk newest to oldest and keep overwriting, so the stored hash ends up
      // being the oldest commit that contains the path (its first appearance).
      const firstSeen = new Map();
      let current = '';
      for (const line of String(scan.output).split(/\r?\n/)) {
        const text = line.trim();
        if (!text) continue;
        if (/^[0-9a-f]{40}$/i.test(text)) {
          current = text;
          continue;
        }
        if (current) firstSeen.set(text, current);
      }

      const hits = [...firstSeen.entries()]
        .filter(([file]) => active.some((pattern) => matchesPathPattern(file, pattern)))
        .map(([file, hash]) => `HISTORY: ${file} (first seen in ${hash.slice(0, 7)})`);

      return gateResult(
        hits.length === 0 ? 'CLEAN' : firstLines(hits, 5).join('\n'),
        hits.length > 0,
      );
    },
  });

  return () => {};
}
