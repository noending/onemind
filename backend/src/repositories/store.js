const memoryStore = require('./memoryStore');

let activeStore = memoryStore;
let storeMode = 'memory';

try {
  const postgresStore = require('./postgresStore');
  postgresStore.initializeDatabase();
  activeStore = postgresStore;
  storeMode = 'postgres';
  console.log('oneMind repository connected to PostgreSQL');
} catch (error) {
  console.warn(`oneMind repository using memory fallback: ${error.message}`);
}

module.exports = {
  ...activeStore,
  getStoreMode() {
    return storeMode;
  }
};
