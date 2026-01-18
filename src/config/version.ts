export const APP_VERSION = {
  version: __APP_VERSION__,
  buildTime: __BUILD_TIME__,
  timestamp: __BUILD_TIMESTAMP__,

  get full() {
    return `${this.version}-${this.buildTime}`;
  },

  get display() {
    return this.version;
  },

  get releaseDate() {
    return new Date(this.timestamp).toLocaleDateString('pt-BR');
  }
};
