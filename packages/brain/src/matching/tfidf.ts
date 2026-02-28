export class TfIdfIndex {
  private documents = new Map<number, string[]>();
  private df = new Map<string, number>();
  private idf = new Map<string, number>();
  private documentCount = 0;

  addDocument(id: number, tokens: string[]): void {
    if (this.documents.has(id)) {
      this.removeDocument(id);
    }
    const unique = new Set(tokens);
    for (const token of unique) {
      this.df.set(token, (this.df.get(token) ?? 0) + 1);
    }
    this.documents.set(id, tokens);
    this.documentCount++;
    this.recomputeIdfForTerms(unique);
  }

  removeDocument(id: number): void {
    const tokens = this.documents.get(id);
    if (!tokens) return;

    const unique = new Set(tokens);
    for (const token of unique) {
      const count = this.df.get(token) ?? 0;
      if (count <= 1) {
        this.df.delete(token);
        this.idf.delete(token);
      } else {
        this.df.set(token, count - 1);
      }
    }
    this.documents.delete(id);
    this.documentCount--;
  }

  query(tokens: string[], topK: number = 10): Array<{ id: number; score: number }> {
    const scores = new Map<number, number>();

    for (const token of tokens) {
      const idfVal = this.idf.get(token) ?? 0;
      if (idfVal === 0) continue;

      for (const [docId, docTokens] of this.documents) {
        const tf = docTokens.filter(t => t === token).length / docTokens.length;
        const score = (scores.get(docId) ?? 0) + tf * idfVal;
        scores.set(docId, score);
      }
    }

    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  getDocumentCount(): number {
    return this.documentCount;
  }

  getIdf(): ReadonlyMap<string, number> {
    return this.idf;
  }

  private recomputeIdfForTerms(terms: Set<string>): void {
    for (const term of terms) {
      const dfVal = this.df.get(term) ?? 0;
      if (dfVal > 0 && this.documentCount > 0) {
        this.idf.set(term, Math.log(this.documentCount / dfVal));
      }
    }
  }
}
