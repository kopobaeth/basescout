export type ScanRequestToken = {
  id: number;
  controller: AbortController;
};

export class ScanRequestCoordinator {
  private generation = 0;
  private active: ScanRequestToken | null = null;

  start(): ScanRequestToken {
    this.active?.controller.abort();

    const token = {
      id: this.generation + 1,
      controller: new AbortController()
    };
    this.generation = token.id;
    this.active = token;
    return token;
  }

  cancel() {
    const hadActiveRequest = Boolean(this.active);
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    return hadActiveRequest;
  }

  isCurrent(token: ScanRequestToken) {
    return this.active === token && this.generation === token.id;
  }

  complete(token: ScanRequestToken) {
    if (!this.isCurrent(token)) return false;
    this.active = null;
    return true;
  }
}
