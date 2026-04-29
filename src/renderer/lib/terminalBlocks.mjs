const terminalBlockOutputMaxChars = 512 * 1024;
const terminalBlockHistoryLimit = 40;

function clampOutputText(value) {
  const text = String(value || '');
  if (text.length <= terminalBlockOutputMaxChars) {
    return {
      output: text,
      truncated: false
    };
  }

  return {
    output: text.slice(text.length - terminalBlockOutputMaxChars),
    truncated: true
  };
}

function utf8ByteLength(value) {
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(String(value || '')).length;
  }

  return String(value || '').length;
}

function normalizeLineEndings(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function stripTerminalControlSequences(value) {
  return String(value || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[()][A-Za-z0-9]/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '')
    .replace(/[\x00\x07\x0B\x0C\x0E-\x1F]/g, (char) => (
      char === '\n' || char === '\r' || char === '\t' || char === '\b' ? char : ''
    ));
}

export function normalizeTerminalBlockOutput(value) {
  let text = normalizeLineEndings(stripTerminalControlSequences(value));

  while (/[^\n]\x08/.test(text)) {
    text = text.replace(/[^\n]\x08/g, '');
  }

  return text.replace(/\x08/g, '');
}

export function normalizeTerminalBlockCommand(value) {
  return normalizeLineEndings(stripTerminalControlSequences(value))
    .replace(/\x1B\[200~/g, '')
    .replace(/\x1B\[201~/g, '')
    .trim();
}

export function createTerminalBlockState() {
  return {
    activeBlockId: null,
    blocks: [],
    inputBuffer: '',
    nextSequence: 1
  };
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') {
    return createTerminalBlockState();
  }

  return {
    activeBlockId: typeof state.activeBlockId === 'string' ? state.activeBlockId : null,
    blocks: Array.isArray(state.blocks) ? state.blocks : [],
    inputBuffer: typeof state.inputBuffer === 'string' ? state.inputBuffer : '',
    nextSequence: Number.isFinite(state.nextSequence) && state.nextSequence > 0
      ? Math.floor(state.nextSequence)
      : 1
  };
}

function updateBlock(state, blockId, updater) {
  let changed = false;
  const blocks = state.blocks.map((block) => {
    if (block.id !== blockId) {
      return block;
    }

    const nextBlock = updater(block);
    changed = nextBlock !== block;
    return nextBlock;
  });

  return changed ? { ...state, blocks } : state;
}

function completeActiveBlock(state, now = Date.now()) {
  const normalizedState = normalizeState(state);
  if (!normalizedState.activeBlockId) {
    return normalizedState;
  }

  const nextState = updateBlock(normalizedState, normalizedState.activeBlockId, (block) => {
    if (block.status !== 'running') {
      return block;
    }

    return {
      ...block,
      status: 'completed',
      updatedAt: now
    };
  });

  return {
    ...nextState,
    activeBlockId: null
  };
}

export function startTerminalBlock(state, command, now = Date.now()) {
  const normalizedCommand = normalizeTerminalBlockCommand(command);
  const normalizedState = completeActiveBlock(state, now);

  if (!normalizedCommand) {
    return normalizedState;
  }

  const sequence = normalizedState.nextSequence;
  const block = {
    id: `terminal-block-${sequence}-${now}`,
    sequence,
    command: normalizedCommand,
    output: '',
    outputBytes: 0,
    outputLineCount: 0,
    outputTruncated: false,
    status: 'running',
    manualStatus: '',
    createdAt: now,
    updatedAt: now
  };

  return {
    ...normalizedState,
    activeBlockId: block.id,
    blocks: [...normalizedState.blocks, block].slice(-terminalBlockHistoryLimit),
    inputBuffer: '',
    nextSequence: sequence + 1
  };
}

function appendInputCharacter(buffer, char) {
  if (char === '\x03') {
    return '';
  }

  if (char === '\b' || char === '\x7f') {
    return buffer.slice(0, -1);
  }

  if (char === '\t') {
    return buffer;
  }

  return char.charCodeAt(0) >= 32 ? `${buffer}${char}` : buffer;
}

export function appendTerminalBlockInput(state, data, now = Date.now()) {
  let nextState = normalizeState(state);
  let buffer = nextState.inputBuffer;
  const startedBlocks = [];
  const input = String(data || '')
    .replace(/\x1B\[200~/g, '')
    .replace(/\x1B\[201~/g, '');

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === '\x1b') {
      const rest = input.slice(index);
      const csiMatch = rest.match(/^\x1B\[[0-?]*[ -/]*[@-~]/);
      if (csiMatch) {
        index += csiMatch[0].length - 1;
      }
      continue;
    }

    if (char === '\r' || char === '\n') {
      const command = normalizeTerminalBlockCommand(buffer);
      buffer = '';
      if (command) {
        nextState = startTerminalBlock(nextState, command, now);
        startedBlocks.push(command);
      }
      continue;
    }

    buffer = appendInputCharacter(buffer, char);
  }

  return {
    state: {
      ...nextState,
      inputBuffer: buffer
    },
    startedBlocks
  };
}

export function appendTerminalBlockOutput(state, data, now = Date.now()) {
  const normalizedState = normalizeState(state);
  if (!normalizedState.activeBlockId) {
    return normalizedState;
  }

  const output = normalizeTerminalBlockOutput(data);
  if (!output) {
    return normalizedState;
  }

  return updateBlock(normalizedState, normalizedState.activeBlockId, (block) => {
    const clamped = clampOutputText(`${block.output || ''}${output}`);
    return {
      ...block,
      output: clamped.output,
      outputBytes: block.outputBytes + utf8ByteLength(output),
      outputLineCount: clamped.output ? clamped.output.split('\n').length : 0,
      outputTruncated: block.outputTruncated || clamped.truncated,
      updatedAt: now
    };
  });
}

export function finishActiveTerminalBlock(state, failed = false, now = Date.now()) {
  const normalizedState = normalizeState(state);
  if (!normalizedState.activeBlockId) {
    return normalizedState;
  }

  const nextState = updateBlock(normalizedState, normalizedState.activeBlockId, (block) => {
    if (block.status !== 'running') {
      return block;
    }

    return {
      ...block,
      status: failed ? 'failed' : 'completed',
      updatedAt: now
    };
  });

  return {
    ...nextState,
    activeBlockId: null
  };
}

export function markLatestTerminalBlockFailed(state, now = Date.now()) {
  const normalizedState = normalizeState(state);
  const latestBlock = getLatestTerminalBlock(normalizedState);
  if (!latestBlock) {
    return normalizedState;
  }

  return updateBlock(normalizedState, latestBlock.id, (block) => ({
    ...block,
    status: 'failed',
    manualStatus: 'failed',
    updatedAt: now
  }));
}

export function getLatestTerminalBlock(state) {
  const normalizedState = normalizeState(state);
  return normalizedState.blocks[normalizedState.blocks.length - 1] || null;
}

function stripEchoedCommand(output, command) {
  const commandLines = normalizeTerminalBlockCommand(command)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (commandLines.length === 0) {
    return output;
  }

  const lines = normalizeLineEndings(output).split('\n');
  let firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex < 0) {
    return '';
  }

  const firstLine = lines[firstContentIndex].trim();
  const fullCommand = commandLines.join('\n');
  const firstCommandLine = commandLines[0];

  if (
    firstLine === fullCommand ||
    firstLine === firstCommandLine ||
    firstLine.endsWith(firstCommandLine)
  ) {
    lines.splice(firstContentIndex, 1);
  }

  return lines.join('\n');
}

export function getTerminalBlockCopyOutput(block) {
  if (!block) {
    return '';
  }

  const output = stripEchoedCommand(block.output || '', block.command).trimEnd();
  if (!output) {
    return '';
  }

  return block.outputTruncated
    ? `[cli-in-one] earlier output for this block was trimmed.\n${output}`
    : output;
}

export function buildTerminalBlockSummary(state) {
  const block = getLatestTerminalBlock(state);
  if (!block) {
    return null;
  }

  return {
    id: block.id,
    sequence: block.sequence,
    command: block.command,
    status: block.status,
    manualStatus: block.manualStatus,
    outputBytes: block.outputBytes,
    outputLineCount: block.outputLineCount,
    outputTruncated: block.outputTruncated,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt
  };
}
