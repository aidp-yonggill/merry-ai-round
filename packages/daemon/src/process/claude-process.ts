import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { ToolUseBlock } from '@merry/shared';

const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

export interface ClaudeProcessOptions {
  model: string;
  systemPrompt: string;
  maxBudgetUsd?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  cwd?: string;
  cliPath?: string;
}

export interface ProcessStreamChunk {
  agentId: string;
  roomId: string;
  messageId: string;
  chunk: string;
  done: boolean;
}

export interface ProcessToolUse {
  agentId: string;
  roomId: string;
  messageId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ProcessToolResult {
  agentId: string;
  roomId: string;
  messageId: string;
  toolUseId: string;
  toolName: string;
  output?: string;
  isError: boolean;
}

export interface ProcessResult {
  content: string;
  toolUseBlocks: ToolUseBlock[];
  numTurns?: number;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

/**
 * Wraps a `claude` CLI subprocess using --print --input-format stream-json --output-format stream-json.
 * Communicates via stdin/stdout JSON lines.
 */
export class ClaudeProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = '';
  private options: ClaudeProcessOptions;
  private _pid: number | undefined;
  private _alive = false;
  private _idle = true;
  private _spawnedAt: string | null = null;

  // Tracking for current message being processed
  private currentMessageId = '';
  private currentAgentId = '';
  private currentRoomId = '';
  private toolUseBlocks: ToolUseBlock[] = [];

  constructor(options: ClaudeProcessOptions) {
    super();
    this.options = options;
  }

  get pid(): number | undefined { return this._pid; }
  get spawnedAt(): string | null { return this._spawnedAt; }

  isAlive(): boolean { return this._alive; }
  isIdle(): boolean { return this._idle; }

  /**
   * Spawn the claude CLI process.
   */
  spawn(): void {
    if (this._alive) return;

    const cliPath = this.options.cliPath ?? process.env.CLAUDE_CLI_PATH ?? 'claude';
    const args = this.buildArgs();

    this.proc = spawn(cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        // Prevent nested Claude Code sessions
        CLAUDECODE: undefined,
      },
    });

    this._pid = this.proc.pid;
    this._alive = true;
    this._spawnedAt = new Date().toISOString();

    // Parse stdout line by line (newline-delimited JSON)
    this.proc.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) this.handleLine(line.trim());
      }
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.error(`[ClaudeProcess:${this._pid}] stderr:`, text);
      }
    });

    this.proc.on('exit', (code, signal) => {
      this._alive = false;
      this._idle = true;
      this.emit('exit', { code, signal });
    });

    this.proc.on('error', (err) => {
      this._alive = false;
      this.emit('error', err);
    });
  }

  /**
   * Send a user message via stdin (stream-json format).
   */
  async sendMessage(content: string, meta: { agentId: string; roomId: string; messageId: string }): Promise<ProcessResult> {
    if (!this.proc?.stdin?.writable) {
      throw new Error('Process stdin is not writable');
    }

    this.currentAgentId = meta.agentId;
    this.currentRoomId = meta.roomId;
    this.currentMessageId = meta.messageId;
    this.toolUseBlocks = [];
    this._idle = false;

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let resultContent = '';
      let numTurns = 0;
      let tokensIn = 0;
      let tokensOut = 0;
      let costUsd = 0;

      const onResult = (data: any) => {
        resultContent = data.result ?? resultContent;
        numTurns = data.num_turns ?? numTurns;
        const usage = data.usage ?? data.total_usage ?? {};
        tokensIn = usage.input_tokens ?? usage.tokens_in ?? tokensIn;
        tokensOut = usage.output_tokens ?? usage.tokens_out ?? tokensOut;
        costUsd = data.cost_usd ?? data.total_cost ?? costUsd;

        cleanup();
        this._idle = true;
        resolve({
          content: resultContent,
          toolUseBlocks: [...this.toolUseBlocks],
          numTurns,
          durationMs: Date.now() - startTime,
          tokensIn,
          tokensOut,
          costUsd,
        });
      };

      const onError = (err: Error) => {
        cleanup();
        this._idle = true;
        reject(err);
      };

      const onExit = (info: { code: number | null }) => {
        cleanup();
        this._idle = true;
        if (info.code !== 0) {
          reject(new Error(`Claude process exited with code ${info.code}`));
        } else {
          resolve({
            content: resultContent,
            toolUseBlocks: [...this.toolUseBlocks],
            numTurns,
            durationMs: Date.now() - startTime,
            tokensIn,
            tokensOut,
            costUsd,
          });
        }
      };

      const cleanup = () => {
        this.off('_result', onResult);
        this.off('error', onError);
        this.off('exit', onExit);
      };

      this.on('_result', onResult);
      this.on('error', onError);
      this.on('exit', onExit);

      // Write message to stdin as JSON line
      const msg = JSON.stringify({
        type: 'user',
        content,
      });
      this.proc!.stdin!.write(msg + '\n');
    });
  }

  /**
   * Gracefully terminate: close stdin, then SIGTERM, then SIGKILL.
   */
  async terminate(timeoutMs = 5000): Promise<void> {
    if (!this._alive || !this.proc) return;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.proc && this._alive) {
          this.proc.kill('SIGKILL');
        }
        resolve();
      }, timeoutMs);

      this.proc!.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      // Try graceful shutdown first
      try {
        this.proc!.stdin?.end();
      } catch { /* ignore */ }

      setTimeout(() => {
        if (this._alive && this.proc) {
          this.proc.kill('SIGTERM');
        }
      }, 500);
    });
  }

  private buildArgs(): string[] {
    const args = [
      '--print',
      '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--model', MODEL_MAP[this.options.model] ?? MODEL_MAP.sonnet,
      '--system-prompt', this.options.systemPrompt,
      '--permission-mode', 'bypassPermissions',
      '--dangerously-skip-permissions',
    ];

    if (this.options.maxBudgetUsd) {
      args.push('--max-budget-usd', String(this.options.maxBudgetUsd));
    }

    if (this.options.allowedTools?.length) {
      args.push('--allowedTools', this.options.allowedTools.join(','));
    }

    if (this.options.disallowedTools?.length) {
      args.push('--disallowedTools', this.options.disallowedTools.join(','));
    }

    return args;
  }

  /**
   * Parse a single JSON line from stdout.
   */
  private handleLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      // Not JSON — could be raw text output, treat as stream chunk
      if (this.currentMessageId) {
        this.emit('stream', {
          agentId: this.currentAgentId,
          roomId: this.currentRoomId,
          messageId: this.currentMessageId,
          chunk: line,
          done: false,
        } satisfies ProcessStreamChunk);
      }
      return;
    }

    switch (msg.type) {
      case 'assistant': {
        const betaMessage = msg.message ?? msg;
        const contentBlocks = betaMessage.content;

        if (contentBlocks) {
          // Extract text
          const textContent = typeof contentBlocks === 'string'
            ? contentBlocks
            : Array.isArray(contentBlocks)
              ? contentBlocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
              : '';

          if (textContent && this.currentMessageId) {
            this.emit('stream', {
              agentId: this.currentAgentId,
              roomId: this.currentRoomId,
              messageId: this.currentMessageId,
              chunk: textContent,
              done: false,
            } satisfies ProcessStreamChunk);
          }

          // Extract tool_use blocks
          if (Array.isArray(contentBlocks)) {
            for (const block of contentBlocks) {
              if (block.type === 'tool_use') {
                if (this.toolUseBlocks.some(b => b.id === block.id)) continue;

                const toolBlock: ToolUseBlock = {
                  id: block.id,
                  toolName: block.name,
                  input: block.input ?? {},
                  status: 'running',
                };
                this.toolUseBlocks.push(toolBlock);

                if (this.currentMessageId) {
                  this.emit('tool_use', {
                    agentId: this.currentAgentId,
                    roomId: this.currentRoomId,
                    messageId: this.currentMessageId,
                    toolUseId: block.id,
                    toolName: block.name,
                    input: block.input ?? {},
                  } satisfies ProcessToolUse);
                }
              }
            }
          }
        }
        break;
      }

      case 'user': {
        const userContent = msg.message?.content ?? msg.content;
        if (Array.isArray(userContent)) {
          for (const block of userContent) {
            if (block.type === 'tool_result') {
              const toolUseId = block.tool_use_id;
              if (toolUseId) {
                const toolBlock = this.toolUseBlocks.find(b => b.id === toolUseId);
                if (toolBlock) {
                  toolBlock.status = block.is_error ? 'error' : 'completed';
                  toolBlock.output = typeof block.content === 'string'
                    ? block.content
                    : Array.isArray(block.content)
                      ? block.content.map((c: any) => c.text ?? '').join('')
                      : JSON.stringify(block.content);
                }

                if (this.currentMessageId) {
                  this.emit('tool_result', {
                    agentId: this.currentAgentId,
                    roomId: this.currentRoomId,
                    messageId: this.currentMessageId,
                    toolUseId,
                    toolName: toolBlock?.toolName ?? 'unknown',
                    output: toolBlock?.output,
                    isError: !!block.is_error,
                  } satisfies ProcessToolResult);
                }
              }
            }
          }
        }
        break;
      }

      case 'result': {
        // Final content + metadata
        const content = msg.result ?? '';
        if (this.currentMessageId) {
          this.emit('stream', {
            agentId: this.currentAgentId,
            roomId: this.currentRoomId,
            messageId: this.currentMessageId,
            chunk: content,
            done: true,
          } satisfies ProcessStreamChunk);
        }
        this.emit('_result', msg);
        break;
      }

      case 'system': {
        // Init message with session info
        if (msg.subtype === 'init') {
          this.emit('init', { sessionId: msg.session_id });
        }
        break;
      }
    }
  }
}
