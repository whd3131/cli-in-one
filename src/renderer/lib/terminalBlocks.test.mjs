import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendTerminalBlockInput,
  appendTerminalBlockOutput,
  createTerminalBlockState,
  finishActiveTerminalBlock,
  getLatestTerminalBlock,
  getTerminalBlockCopyOutput,
  markLatestTerminalBlockFailed,
  startTerminalBlock
} from './terminalBlocks.mjs';

test('starts a command block from terminal input and collects output', () => {
  let state = createTerminalBlockState();
  state = appendTerminalBlockInput(state, 'npm test\r', 1000).state;
  state = appendTerminalBlockOutput(state, 'npm test\r\nok\r\n', 1001);

  const block = getLatestTerminalBlock(state);
  assert.equal(block.command, 'npm test');
  assert.equal(block.status, 'running');
  assert.equal(getTerminalBlockCopyOutput(block), 'ok');
});

test('starting another block completes the previous block', () => {
  let state = startTerminalBlock(createTerminalBlockState(), 'first', 1000);
  state = appendTerminalBlockOutput(state, 'done\n', 1001);
  state = startTerminalBlock(state, 'second', 1002);

  assert.equal(state.blocks[0].status, 'completed');
  assert.equal(getLatestTerminalBlock(state).command, 'second');
});

test('can mark the latest block failed and finish an active block on exit', () => {
  let state = startTerminalBlock(createTerminalBlockState(), 'deploy', 1000);
  state = markLatestTerminalBlockFailed(state, 1001);

  assert.equal(getLatestTerminalBlock(state).status, 'failed');

  state = startTerminalBlock(state, 'cleanup', 1002);
  state = finishActiveTerminalBlock(state, true, 1003);

  assert.equal(getLatestTerminalBlock(state).status, 'failed');
  assert.equal(state.activeBlockId, null);
});
