import mongoose from 'mongoose';
import { migrateImageIds } from '../src/services/imageMigration.service.js';
import { processImageCleanup } from '../src/services/imageCleanup.service.js';
import ImageAsset from '../src/models/ImageAsset.js';

// Explicit separate URI, never import server.js, database.js or dotenv here.
const [command, flag] = process.argv.slice(2);
if (!['migrate', 'cleanup'].includes(command) || !['--dry-run', '--apply', undefined].includes(flag) || process.argv.length > 4) {
  console.error('Uso: node backend/scripts/images.js migrate|cleanup [--dry-run|--apply]');
  process.exitCode = 1;
} else if (!process.env.IMAGE_MAINTENANCE_MONGODB_URI || process.env.NODE_ENV === 'test') {
  console.error('Defina IMAGE_MAINTENANCE_MONGODB_URI explicitamente fora do ambiente de testes.');
  process.exitCode = 1;
} else {
  try {
    await mongoose.connect(process.env.IMAGE_MAINTENANCE_MONGODB_URI,
      { serverSelectionTimeoutMS: 5000, autoIndex: false, autoCreate: false });
    if (command === 'migrate') console.log(await migrateImageIds({ dryRun: flag !== '--apply' }));
    else if (flag === '--apply') console.log(await processImageCleanup());
    else console.log(await ImageAsset.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]));
  } catch {
    console.error('Manutenção de imagens falhou. Verifique configuração e disponibilidade.');
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
