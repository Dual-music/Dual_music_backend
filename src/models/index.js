import Sequelize from 'sequelize';

import { sequelize } from '../config/sequelize.js';

import { applyAssociations } from './associations.js';
import { authModels } from './auth.models.js';
import { infraModels } from './infra.models.js';
import { generatedModels } from './tables/index.js';

/**
 * @file Model registry & association wiring — the single import surface for the
 * data layer. Repositories/services import `{ db }` and reach models as
 * `db.User`, `db.Duel`, etc. Instantiates auth models first (so user-referencing
 * FKs resolve), then generated table models, then applies all associations.
 *
 * @module models/index
 */

/** @type {Record<string, import('sequelize').ModelStatic<any>>} */
const models = {};
for (const { name, define } of [...authModels, ...infraModels, ...generatedModels]) {
  models[name] = define(sequelize);
}

applyAssociations(models);

/**
 * Aggregate data-layer handle.
 * @typedef {typeof models & { sequelize: import('sequelize').Sequelize, Sequelize: typeof Sequelize }} Db
 */
export const db = Object.freeze({ sequelize, Sequelize, ...models });

export default db;
