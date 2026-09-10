// Reproducible strategy measurement. Observations never enter bot decisions.
// Example: node games/texas-holdem/scripts/measure-ai.mjs --hands 250
// Relative --engine paths resolve from the working directory; the default
// engine resolves from this script, so it also works from other directories.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const SEED = 'open-tabletop-ai-measure-v1';
const ACTION_LIMIT = 1000;
const ACTION_TYPES = ['fold', 'call', 'check', 'raise', 'all-in'];
const LIVE_PHASES = new Set(['preflop', 'flop', 'turn', 'river']);
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;

function options(argv) {
  const result = {engine: new URL('../web/engine.js', import.meta.url), hands: 250, difficulty: 'standard'};
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--help') { result.help = true; continue; }
    if (!['--engine', '--hands', '--difficulty'].includes(option)) throw Error(`Unknown option: ${option}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw Error(`Missing value for ${option}`);
    if (option === '--engine') result.engine = value.startsWith('file:') ? new URL(value) : pathToFileURL(resolve(value));
    if (option === '--hands') {
      if (!/^\d+$/.test(value)) throw Error('--hands must be a positive integer');
      result.hands = Number(value);
    }
    if (option === '--difficulty') result.difficulty = value;
  }
  if (!Number.isSafeInteger(result.hands) || result.hands < 1) throw Error('--hands must be a positive safe integer');
  if (!['casual', 'standard', 'expert'].includes(result.difficulty)) throw Error('--difficulty must be casual, standard, or expert');
  return result;
}

async function measure(config) {
  const source = await readFile(config.engine);
  const {PokerGame} = await import(config.engine.href);
  if (typeof PokerGame !== 'function') throw Error('The engine must export PokerGame');
  const game = new PokerGame({mode: 'practice', difficulty: config.difficulty, seed: SEED});
  const initial = game.getPublicState();
  const brands = initial.players.filter(player => player.id > 0).map(player => ({
    seat: player.id, brand: player.brand, name: player.name, hands: 0,
    vpipHands: 0, pfrHands: 0,
    actions: Object.fromEntries(ACTION_TYPES.map(type => [type, 0])),
    totalActions: 0, postflopOpenBetOpportunities: 0, postflopOpenBets: 0,
    allInActions: 0, allInHands: 0,
  }));
  const bySeat = new Map(brands.map(brand => [brand.seat, brand]));
  const integrity = {
    completedHands: 0, actionLimitPerHand: ACTION_LIMIT, maxActionsInHand: 0,
    totalActions: 0, actionLimitViolations: 0,
    chipConservationChecks: 0, chipConservationViolations: 0,
    identityChecks: 0, identityViolations: 0,
  };
  let handNumber = 0, handActions = 0, failure = null;

  function checkState(state) {
    integrity.identityChecks++;
    if (state.players.length !== 6 || state.players.some((player, seat) => player.id !== seat || player.isHuman !== (seat === 0))) {
      integrity.identityViolations++;
      throw Error('Expected an unchanged human seat 0 and bot seats 1–5');
    }
    integrity.chipConservationChecks++;
    const total = state.players.reduce((sum, player) => sum + player.stack, 0) + state.pot;
    const validChips = state.players.every(player => ['stack', 'bet', 'contribution'].every(key => Number.isSafeInteger(player[key]) && player[key] >= 0));
    if (!validChips || !Number.isSafeInteger(state.pot) || state.pot < 0 || state.totalChips !== initial.totalChips || total !== initial.totalChips) {
      integrity.chipConservationViolations++;
      throw Error(`Chip conservation failed: ${total} / ${initial.totalChips}`);
    }
  }

  try {
    checkState(initial);
    for (handNumber = 1; handNumber <= config.hands; handNumber++) {
      let state = game.startHand();
      checkState(state);
      handActions = 0;
      const flags = new Map(brands.map(brand => [brand.seat, {vpip: false, pfr: false, allIn: false}]));
      for (const brand of brands) brand.hands++;
      while (LIVE_PHASES.has(state.phase)) {
        if (handActions >= ACTION_LIMIT) {
          integrity.actionLimitViolations++;
          throw Error(`Hand exceeded ${ACTION_LIMIT} actions`);
        }
        const seat = state.currentPlayerIndex;
        const player = state.players[seat];
        const legal = state.legalActions;
        const lastHistoryId = state.history.at(-1)?.id ?? 0;
        const preflop = state.phase === 'preflop';
        const openBetOpportunity = !preflop && state.currentBet === 0 && legal.canCheck && legal.canRaise;
        // Only the built-in botAction may make a bot decision. No hole cards,
        // observations, replacement RNG, or modified identities are supplied.
        const decision = seat === 0
          ? game.act(legal.canCheck ? 'check' : 'call')
          : game.botAction();
        if (!decision || decision.playerId !== seat) throw Error('Engine did not execute the expected actor');
        const next = game.getPublicState();
        const events = next.history.filter(entry => entry.id > lastHistoryId && entry.playerId === seat && ACTION_TYPES.includes(entry.type));
        if (events.length !== 1) throw Error(`Expected one action event; observed ${events.length}`);
        const event = events[0];
        handActions++;
        integrity.totalActions++;
        integrity.maxActionsInHand = Math.max(integrity.maxActionsInHand, handActions);
        checkState(next);
        const brand = bySeat.get(seat);
        if (brand) {
          const hand = flags.get(seat);
          brand.actions[event.type]++;
          brand.totalActions++;
          const raised = event.type === 'raise' || event.type === 'all-in';
          hand.vpip ||= preflop && event.amount > 0;
          hand.pfr ||= preflop && raised;
          if (openBetOpportunity) {
            brand.postflopOpenBetOpportunities++;
            if (raised) brand.postflopOpenBets++;
          }
          // The action log retains the amount paid even if a later uncalled
          // return or immediate showdown changes the player's stack again.
          if (event.amount > 0 && event.amount === player.stack) {
            brand.allInActions++;
            hand.allIn = true;
          }
        }
        state = next;
      }
      if (state.phase !== 'complete') throw Error(`Unexpected ending phase: ${state.phase}`);
      for (const brand of brands) {
        const hand = flags.get(brand.seat);
        brand.vpipHands += Number(hand.vpip);
        brand.pfrHands += Number(hand.pfr);
        brand.allInHands += Number(hand.allIn);
      }
      integrity.completedHands++;
    }
  } catch (error) {
    failure = {message: error.message, hand: handNumber, actionsInHand: handActions};
  }

  return {
    schemaVersion: 1, ok: !failure,
    engine: {module: basename(fileURLToPath(config.engine)), sha256: createHash('sha256').update(source).digest('hex')},
    scenario: {
      mode: 'practice', difficulty: config.difficulty, handsRequested: config.hands, seed: SEED,
      seedMode: 'One fixed-seed practice session; normal dealer rotation; the engine resets stacks each hand.',
      humanPolicy: 'Seat 0 checks whenever legal and otherwise calls.',
      botPolicy: 'Seats 1–5 execute the imported engine botAction() without intervention.',
    },
    definitions: {
      rates: 'Fractions from 0 to 1; null when the denominator is zero.',
      hands: 'Hands dealt to the brand. Practice mode keeps all six seats in every hand.',
      vpip: 'Hands with a voluntary preflop chip payment, excluding posted blinds; divided by hands.',
      pfr: 'Hands containing a preflop raise, including a short all-in raise; divided by hands.',
      actions: 'Actual engine log categories; all-in calls remain call, all-in raises are all-in.',
      postflopOpenBet: 'Decision opportunities on flop/turn/river with currentBet=0 and both check and raise legal; the rate is opening bets divided by these opportunities.',
      allIn: 'Actions paying the entire pre-action stack, including all-in calls; action rate divides by totalActions and hand rate divides by hands.',
      scope: 'Descriptive behavior against a passive human in six-seat practice games, not a win-rate or playing-strength benchmark.',
    },
    brands: brands.map(brand => ({
      ...brand,
      vpipRate: ratio(brand.vpipHands, brand.hands),
      pfrRate: ratio(brand.pfrHands, brand.hands),
      postflopOpenBetRate: ratio(brand.postflopOpenBets, brand.postflopOpenBetOpportunities),
      allInActionRate: ratio(brand.allInActions, brand.totalActions),
      allInHandRate: ratio(brand.allInHands, brand.hands),
    })),
    integrity,
    ...(failure ? {error: failure} : {}),
  };
}

try {
  const config = options(process.argv.slice(2));
  const output = config.help ? {
    usage: 'node games/texas-holdem/scripts/measure-ai.mjs [--engine <local module path or file URL>] [--hands <positive integer>] [--difficulty casual|standard|expert]',
    defaults: {engine: '../web/engine.js relative to this script', hands: 250, difficulty: 'standard', seed: SEED},
    output: 'JSON on stdout. Nonzero exit status indicates invalid input or a failed measurement.',
  } : await measure(config);
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  if (output.ok === false) process.exitCode = 1;
} catch (error) {
  process.stdout.write(JSON.stringify({ok: false, error: {message: error.message}}, null, 2) + '\n');
  process.exitCode = 1;
}
