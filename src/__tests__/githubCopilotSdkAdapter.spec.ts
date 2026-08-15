import { describe, expect, it } from 'vitest';
import {
  createScopedPermissionHandler,
  mapToolsForCopilotSdk,
  normalizeCopilotToolInput,
  normalizeCopilotToolName,
} from '../adapters/githubCopilotSdkAdapter.js';

describe('GitHub Copilot SDK adapter mappings', () => {
  it('maps Pantoum tool intents to Copilot built-in tools', () => {
    const toolSet = mapToolsForCopilotSdk(['Read', 'Edit', 'Write', 'MultiEdit', 'Bash', 'Grep', 'LS']);
    const entries = toolSet!.toArray();

    expect(entries).toContain('builtin:view');
    expect(entries).toContain('builtin:edit');
    expect(entries).toContain('builtin:create');
    expect(entries).toContain('builtin:apply_patch');
    expect(entries).toContain('builtin:bash');
    expect(entries).toContain('builtin:grep');
    expect(entries).toContain('builtin:rg');
    expect(entries).toContain('builtin:glob');
  });

  it('requests an edit tool even when only editing intents are allowed', () => {
    const entries = mapToolsForCopilotSdk(['Read', 'Edit', 'Grep', 'Write'])!.toArray();

    expect(entries).toContain('builtin:edit');
    expect(entries).toContain('builtin:create');
    expect(entries).toContain('builtin:grep');
    expect(entries).not.toContain('builtin:bash');
  });

  it('never exposes delegating or interactive session tools', () => {
    const entries = mapToolsForCopilotSdk(['Read', 'Edit'])!.toArray();

    // `task` runs with tools: ["*"] and would bypass the allow-list entirely,
    // `ask_user` blocks forever in a headless run.
    expect(entries).not.toContain('builtin:task');
    expect(entries).not.toContain('builtin:ask_user');
    expect(entries).not.toContain('builtin:read_agent');
    expect(entries).not.toContain('builtin:write_agent');
    expect(entries).not.toContain('builtin:list_agents');
    expect(entries).not.toContain('builtin:skill');
    expect(entries).not.toContain('builtin:exit_plan_mode');
  });

  it('normalizes Copilot built-in tool names back to Pantoum tool names', () => {
    expect(normalizeCopilotToolName('view')).toBe('Read');
    expect(normalizeCopilotToolName('edit')).toBe('Edit');
    expect(normalizeCopilotToolName('apply_patch')).toBe('Edit');
    expect(normalizeCopilotToolName('str_replace_editor')).toBe('Edit');
    expect(normalizeCopilotToolName('create')).toBe('Write');
    expect(normalizeCopilotToolName('bash')).toBe('Bash');
    expect(normalizeCopilotToolName('grep')).toBe('Grep');
    expect(normalizeCopilotToolName('rg')).toBe('Grep');
    expect(normalizeCopilotToolName('glob')).toBe('LS');
    expect(normalizeCopilotToolName('unknown-tool')).toBe('unknown-tool');
  });

  it('normalizes Copilot tool arguments to the Claude-shaped input', () => {
    expect(normalizeCopilotToolInput({ path: '/a/b.ts', old_str: 'x', new_str: 'y' })).toMatchObject({
      file_path: '/a/b.ts',
      old_string: 'x',
      new_string: 'y',
    });

    expect(normalizeCopilotToolInput({ path: '/a/b.ts', file_text: 'content' })).toMatchObject({
      file_path: '/a/b.ts',
      content: 'content',
    });

    // Claude-shaped input passes through untouched
    expect(normalizeCopilotToolInput({ file_path: '/a/b.ts', old_string: 'x' })).toMatchObject({
      file_path: '/a/b.ts',
      old_string: 'x',
    });
  });
});

describe('scoped permission handler', () => {
  // A live run (2026-08-15) edited files in an unrelated repository via absolute
  // paths — workingDirectory is a default for the SDK's file tools, not a boundary.
  const workdir = '/tmp/pantoum-sandbox/solution';
  const invocation = { sessionId: 's1' };

  it('denies a write outside the working directory and reports it', () => {
    const denied: string[] = [];
    const handler = createScopedPermissionHandler(workdir, (f) => denied.push(f));

    const result = handler(
      { kind: 'write', fileName: '/Users/someone/real-repo/src/file.ts' } as never,
      invocation
    );

    expect(result).toMatchObject({ kind: 'denied-interactively-by-user' });
    expect(denied).toEqual(['/Users/someone/real-repo/src/file.ts']);
  });

  it('denies path-traversal writes that resolve outside the working directory', () => {
    const handler = createScopedPermissionHandler(workdir);
    const result = handler(
      { kind: 'write', fileName: '../../other-solution/file.ts' } as never,
      invocation
    );
    expect(result).toMatchObject({ kind: 'denied-interactively-by-user' });
  });

  it('approves writes inside the working directory', () => {
    const handler = createScopedPermissionHandler(workdir);
    const relative = handler({ kind: 'write', fileName: 'src/inside.ts' } as never, invocation);
    const absolute = handler(
      { kind: 'write', fileName: `${workdir}/src/inside.ts` } as never,
      invocation
    );
    expect(relative).toMatchObject({ kind: 'approve-once' });
    expect(absolute).toMatchObject({ kind: 'approve-once' });
  });

  it('approves non-write kinds unchanged', () => {
    const handler = createScopedPermissionHandler(workdir);
    const read = handler({ kind: 'read', path: '/anywhere/else.ts' } as never, invocation);
    expect(read).toMatchObject({ kind: 'approve-once' });
  });
});
