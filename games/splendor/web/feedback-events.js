// Presentation events are derived only from cards already public on the table.
// Reserved cards, deck order and the contents of face-down evolved cards are unused.
function validSnapshot(state) {
  return state && Number.isSafeInteger(state.version) && state.version >= 0 &&
    Array.isArray(state.players) && state.players.every(player =>
      Number.isInteger(player.seat) && Array.isArray(player.cards) &&
      Array.isArray(player.evolved) && player.cards.every(card => card && !card.hidden && typeof card.id === 'string'));
}

function benefits(card, fromCard) {
  const changes = new Map();
  for (const [item, sign] of [[card, 1], [fromCard, -1]]) {
    if (item) changes.set(item.bonus, (changes.get(item.bonus) || 0) + sign * item.bonusAmount);
  }
  return {
    bonusChanges: Object.fromEntries([...changes].filter(([, amount]) => amount !== 0)),
    pointsDelta: card.points - (fromCard?.points || 0),
  };
}

/** Compare successive public game snapshots; passing the accepted after snapshot
 * as the next before snapshot prevents repeat playback without module state. */
export function acquisitionEvents(before, after) {
  if (!validSnapshot(before) || !validSnapshot(after) || after.version <= before.version ||
      before.schema !== after.schema || before.first !== after.first || after.turn < before.turn ||
      before.players.length !== after.players.length || before.phase === 'complete') return [];

  const previous = new Map(before.players.map(player => [player.seat, player]));
  const changes = [];
  for (const player of after.players) {
    const prior = previous.get(player.seat);
    // A new game, replaced roster or shrinking collection is not an acquisition.
    if (!prior || prior.name !== player.name || player.cards.length < prior.cards.length ||
        player.evolved.length < prior.evolved.length) return [];
    const priorIds = new Set(prior.cards.map(card => card.id));
    const currentIds = new Set(player.cards.map(card => card.id));
    const added = player.cards.filter(card => !priorIds.has(card.id));
    const removed = prior.cards.filter(card => !currentIds.has(card.id));
    const evolutionCount = player.evolved.length - prior.evolved.length;
    if (removed.length > evolutionCount) return [];
    changes.push({player, added, removed, evolutionCount});
  }

  return changes.flatMap(({player, added, removed, evolutionCount}) => {
    const used = new Set();
    return added.map(card => {
      const fromCard = evolutionCount > used.size ? removed.find(from => !used.has(from.id) &&
        from.evolvesToSpeciesId === card.speciesId && card.stage === from.stage + 1) || null : null;
      if (fromCard) used.add(fromCard.id);
      const kind = fromCard ? 'evolve' : 'capture';
      return {seat: player.seat, card: structuredClone(card), kind,
        fromCard: fromCard ? structuredClone(fromCard) : null,
        key: `${after.version}:${player.seat}:${card.id}:${kind}`,
        ...benefits(card, fromCard)};
    });
  });
}
