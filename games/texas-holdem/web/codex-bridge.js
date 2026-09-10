/* Optional, read-only Codex integration. The game works without WebMCP. */
const context = document.modelContext || navigator.modelContext;
const emptySchema = { type: 'object', properties: {}, additionalProperties: false };

function publicTable() {
  const getter = window.velvetDebug?.getPublicState;
  const state = typeof getter === 'function' ? getter() : null;
  if (!state) return { status: 'lobby', message: '玩家尚未进入牌局。请让玩家在页面选择模式。' };
  // Copy an explicit allowlist; never read the serialized save or private engine.
  return {
    game: 'Velvet Poker · 丝绒牌局',
    mode: state.mode, difficulty: state.difficulty, phase: state.phase,
    handNumber: state.handNumber, board: state.board, pot: state.pot,
    blinds: state.blinds, currentPlayerIndex: state.currentPlayerIndex,
    legalActions: state.currentPlayerIndex === 0 ? state.legalActions : null,
    players: state.players.map(p => ({
      id: p.id, name: p.name, stack: p.stack, bet: p.bet,
      folded: p.folded, allIn: p.allIn, eliminated: p.eliminated,
      isDealer: p.isDealer, isSmallBlind: p.isSmallBlind, isBigBlind: p.isBigBlind,
      hole: p.isHuman || ['showdown', 'complete'].includes(state.phase) ? p.hole : [null, null],
      lastAction: p.lastAction,
    })),
    recentActions: state.history?.slice(-16), gameOver: state.gameOver,
    note: '仅含玩家在牌桌可见的信息。游戏使用虚拟筹码；请解释选项，除非用户明确要求，不要代替玩家下注。',
  };
}

if (context?.registerTool) {
  Promise.resolve(context.registerTool({
    name: 'velvet_poker_table',
    title: '查看丝绒牌局',
    description: 'Read the current Velvet Poker table: public community cards, human hole cards, chip stacks, visible actions and legal options. Never reveals opponents hidden cards and never changes the game. Useful when the player asks Codex to explain a hand.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true },
    execute: async () => JSON.stringify(publicTable()),
  })).catch(() => { /* Browser may disable this optional integration. */ });
}
