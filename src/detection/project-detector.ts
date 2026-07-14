import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ProjectInfo {
  projectType: string;
  languages: string[];
  instructionFiles: string[];
  markerFiles: string[];
}

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', '.cursorrules'];

/** Lightweight, read-only project detection based on marker files. */
export async function detectProject(root: string): Promise<ProjectInfo> {
  const markers: Array<{ file: string; type: string; language: string }> = [
    { file: 'package.json', type: 'node', language: 'JavaScript/TypeScript' },
    { file: 'pyproject.toml', type: 'python', language: 'Python' },
    { file: 'requirements.txt', type: 'python', language: 'Python' },
    { file: 'Cargo.toml', type: 'rust', language: 'Rust' },
    { file: 'go.mod', type: 'go', language: 'Go' },
    { file: 'pom.xml', type: 'java', language: 'Java' },
    { file: 'build.gradle', type: 'java', language: 'Java/Kotlin' },
    { file: 'Gemfile', type: 'ruby', language: 'Ruby' },
    { file: 'composer.json', type: 'php', language: 'PHP' },
  ];

  const found = markers.filter((marker) => existsSync(path.join(root, marker.file)));
  const instructionFiles = INSTRUCTION_FILES.filter((file) => existsSync(path.join(root, file)));

  let projectType = found[0]?.type ?? 'unknown';
  if (found.some((m) => m.file === 'package.json')) {
    projectType = (await isTypeScriptProject(root)) ? 'node-typescript' : 'node';
  }

  return {
    projectType,
    languages: [...new Set(found.map((m) => m.language))],
    instructionFiles,
    markerFiles: found.map((m) => m.file),
  };
}

async function isTypeScriptProject(root: string): Promise<boolean> {
  if (existsSync(path.join(root, 'tsconfig.json'))) return true;
  try {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.devDependencies?.typescript ?? pkg.dependencies?.typescript);
  } catch {
    return false;
  }
}
