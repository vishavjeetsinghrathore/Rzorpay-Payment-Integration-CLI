function createLogger(file) {
  return (label, details) => console.log(`[server][${file}] ${label}`, details ?? '');
}

module.exports = { createLogger };
