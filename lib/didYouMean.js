function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

function damerauLevenshtein(a, b) {
  const source = normalize(a);
  const target = normalize(b);
  const rows = source.length + 1;
  const cols = target.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        source[i - 1] === target[j - 2] &&
        source[i - 2] === target[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }

  return matrix[source.length][target.length];
}

function similarityPercent(a, b) {
  const source = normalize(a);
  const target = normalize(b);
  if (!source || !target) return 0;
  if (source === target) return 100;

  const distance = damerauLevenshtein(source, target);
  const longest = Math.max(source.length, target.length);
  let score = (1 - distance / longest) * 100;

  if (target.startsWith(source) || source.startsWith(target)) score += 5;
  if (source[0] === target[0]) score += 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function pluginIsVisible(plugin, context = {}) {
  if (plugin.owner && !context.isCreator) return false;
  if (plugin.group && !context.isGroup) return false;
  if (plugin.private && context.isGroup) return false;
  if (plugin.admin && !context.isAdmin && !context.isCreator) return false;
  if (plugin.botAdmin && !context.isBotAdmin) return false;
  if (plugin.premium && !context.user?.premium && !context.isCreator) return false;
  return true;
}

function findCommandSuggestions(pluginManager, input, context = {}, options = {}) {
  const query = normalize(input);
  if (!query) return [];

  const limit = Math.max(1, Number(options.limit) || 3);
  const minimum = Math.max(0, Number(options.minimum) || 0);
  const results = [];

  for (const plugin of pluginManager.plugins || []) {
    if (typeof plugin.run !== 'function' || !pluginIsVisible(plugin, context)) continue;

    let bestScore = 0;
    let matchedAlias = '';
    for (const alias of plugin.commands || []) {
      const score = similarityPercent(query, alias);
      if (score > bestScore) {
        bestScore = score;
        matchedAlias = alias;
      }
    }

    if (bestScore < minimum) continue;
    results.push({
      command: plugin.commands?.[0] || plugin.name,
      matchedAlias,
      score: bestScore,
      description: plugin.description || plugin.name,
      category: plugin.category || 'other'
    });
  }

  const unique = new Map();
  for (const result of results.sort((a, b) => b.score - a.score || a.command.localeCompare(b.command))) {
    const current = unique.get(result.command);
    if (!current || result.score > current.score) unique.set(result.command, result);
  }

  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function buildSuggestionMessage(input, suggestions, prefix = '.') {
  const best = suggestions[0];
  if (!best) return '';

  const lines = [
    '🤔 *Did you mean?*',
    '',
    `Command \`${input}\` tidak ditemukan.`,
    'Mungkin yang kamu maksud:'
  ];

  suggestions.forEach((item, index) => {
    lines.push(`${index === 0 ? '➜' : '•'} *${prefix}${item.command}* — ${item.score}% mirip`);
    if (index === 0 && item.description) lines.push(`  _${item.description}_`);
  });

  lines.push('');
  lines.push(`Coba kirim: *${prefix}${best.command}* atau *${best.command}*`);
  return lines.join('\n');
}

module.exports = {
  normalize,
  damerauLevenshtein,
  similarityPercent,
  findCommandSuggestions,
  buildSuggestionMessage
};
