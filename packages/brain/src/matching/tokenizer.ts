const STOPWORDS = new Set([
  'the', 'is', 'are', 'a', 'an', 'and', 'or', 'not', 'in', 'at', 'by', 'for',
  'from', 'of', 'on', 'to', 'with', 'as', 'error', 'exception', 'throw', 'catch',
  'was', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'we', 'you', 'he', 'she', 'they',
]);

export function splitCamelCase(text: string): string[] {
  return text
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

export function splitSnakeCase(text: string): string[] {
  return text.split(/[_\-]+/).filter(t => t.length > 0);
}

export function removeStopwords(tokens: string[]): string[] {
  return tokens.filter(t => !STOPWORDS.has(t.toLowerCase()));
}

export function tokenize(text: string): string[] {
  const words = text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  const tokens: string[] = [];
  for (const word of words) {
    tokens.push(...splitCamelCase(word));
    if (word.includes('_') || word.includes('-')) {
      tokens.push(...splitSnakeCase(word));
    }
  }

  const cleaned = removeStopwords(tokens);
  return [...new Set(cleaned.map(t => t.toLowerCase()))];
}
