// Flutter Helper Bundle - Registers as a host plugin tool
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

// Resolve paths relative to this module, never from raw Windows strings.
// import.meta.url is a file:// URL; fileURLToPath converts it to a native path.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the optional plugin-local .env (e.g. GITHUB_TOKEN) using a resolved
// path, so it works no matter where the project or plugin is installed.
function loadPluginEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
      if (!match) continue;
      let value = match[2] ?? '';
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  } catch {
    // .env is optional
  }
}

loadPluginEnv();

export const inject = ['tools'];

const execAsync = promisify(exec);

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

const noParameters = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return [stdout, stderr]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n') || '(no output)';
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

export function apply(ctx, config) {
  // Flutter outline: file skeleton with line numbers for low-context inspection.
  ctx.tools.register({
    name: 'flutter_outline',
    description: 'Extract class, void, Widget, Future<, and State< declarations with line numbers from a .dart file.',
    parameters: filePathParameters,
    output: textOutput,
    execute: async ({ filePath }) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const result = lines.map((line, index) => {
          if (line.includes('class ') || line.includes('void ') ||
              line.includes('Widget ') || line.includes('Future<') ||
              line.includes('State<')) {
            return `Line ${index + 1}: ${line.trim()}`;
          }
          return null;
        }).filter((line) => line !== null);

        return result.length > 0 ? result.join('\n') : 'No matching declarations found.';
      } catch (error) {
        return `Error reading file: ${error.message}`;
      }
    },
  });

  // Format the project and run static analysis.
  ctx.tools.register({
    name: 'flutter_check',
    description: 'Format code with dart format and analyze with flutter analyze.',
    parameters: filePathParameters,
    output: textOutput,
    execute: ({ filePath }) => runCommand(`cmd /c dart format lib/${filePath} && flutter analyze`),
  });

  // Create a Git checkpoint before editing.
  ctx.tools.register({
    name: 'git_save',
    description: 'Save all changes to the git repository with the commit message "checkpoint".',
    parameters: filePathParameters,
    output: textOutput,
    execute: ({ filePath }) => runCommand(`cmd /c git add ${filePath} && git commit -m "checkpoint"`),
  });

  // Revert uncommitted changes if an edit breaks the build.
  ctx.tools.register({
    name: 'git_undo',
    description: 'Undo all uncommitted git changes.',
    parameters: filePathParameters,
    output: textOutput,
    execute: ({ filePath }) => runCommand(`cmd /c git checkout -- ${filePath} && git reset HEAD ${filePath}`),
  });

  // Push changes to the main branch on GitHub.
  ctx.tools.register({
    name: 'git_push',
    description: 'Push all changes to the GitHub repository.',
    parameters: noParameters,
    output: textOutput,
    execute: () => runCommand('cmd /c git push origin main'),
  });

  // Build a release Android APK.
  ctx.tools.register({
    name: 'flutter_build_apk',
    description: 'Build an Android APK with flutter build apk.',
    parameters: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Path where the APK is written',
        },
      },
      required: ['outputPath'],
      additionalProperties: false,
    },
    output: textOutput,
    execute: ({ outputPath }) => runCommand(`cmd /c flutter build apk --release --output ${outputPath}`),
  });

  return () => {}
}
