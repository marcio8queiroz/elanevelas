import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

let mongoServer;
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/forbidden-test-bootstrap';
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External HTTP forbidden in tests'); }));
});

process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-and-unique';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-and-unique';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});
