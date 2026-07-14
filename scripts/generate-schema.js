/* eslint-disable no-console */
/**
 * @file Schema generator — Supabase `types.ts` → Sequelize models + MySQL migration.
 *
 * WHY: the frontend is the live source of truth. Its generated
 * `src/integrations/supabase/types.ts` describes the exact post-migration
 * Postgres schema (every table, column, nullability, and which columns have a
 * DB default). Rather than hand-transcribe ~72 tables (inconsistent + error
 * prone), this script parses that file and emits, from a single intermediate
 * descriptor:
 *   1. `src/models/tables/<Name>.model.js` — one Sequelize model per table.
 *   2. `src/models/tables/index.js`         — registry consumed by models/index.js.
 *   3. `src/migrations/0001-init-schema.cjs` — a single reversible migration that
 *      creates every table (columns + PK), then adds indexes and the
 *      high-confidence foreign keys.
 *
 * Type mapping is heuristic (Postgres detail is lost in types.ts) but curated:
 * TS `Json`→JSON, `boolean`→BOOLEAN, `number`→INTEGER|DECIMAL (by name),
 * `string`→UUID|DATE|TEXT|STRING (by name). Overrides below capture the few
 * ambiguous columns. Re-run any time with `npm run db:generate:schema`.
 *
 * @module scripts/generate-schema
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TYPES_PATH = path.resolve(
  ROOT,
  '..',
  'duel_music_frontend',
  'src',
  'integrations',
  'supabase',
  'types.ts',
);
const MODELS_DIR = path.join(ROOT, 'src', 'models', 'tables');
const MIGRATIONS_DIR = path.join(ROOT, 'src', 'migrations');

// ---------------------------------------------------------------------------
// Curated overrides
// ---------------------------------------------------------------------------

/** Columns ending in `_id`/`_by` that are NOT UUID foreign keys (free text). */
const NON_UUID_ID_KEYWORDS = [
  'room', 'stripe', 'session', 'external', 'merchant', 'provider', 'checkout',
  'transaction', 'payment', 'moneroo', 'cinetpay', 'token',
];

/** number columns whose name implies a monetary/decimal value. */
const DECIMAL_KEYWORDS = [
  'price', 'amount', 'balance', 'revenue', 'earnings', 'value', 'rate', 'fee',
  'net', 'gross', 'commission', 'payout', 'reward', 'cash', 'total',
];

/** string columns that should be TEXT (long content). */
const TEXT_KEYWORDS = [
  'description', 'bio', 'content', 'message', 'excerpt', 'reason', 'details',
  'justification', 'experience', 'notes', 'address', 'comment_text',
];

/** boolean columns that default to TRUE (everything else defaults to FALSE). */
const BOOLEAN_TRUE_DEFAULTS = new Set(['is_public', 'is_active']);

/**
 * User-content tables that use soft delete (paranoid): `destroy()` sets
 * `deleted_at` instead of removing the row, and reads exclude soft-deleted rows.
 * (§5 — soft delete on user content; hard delete on secrets/logs.)
 */
const PARANOID_TABLES = new Set(['comments', 'blogs', 'lifestyle_videos', 'replay_videos']);

/** Per-`table.column` explicit default overrides (value rendered verbatim in JS). */
const DEFAULT_OVERRIDES = {
  'manager_profiles.commission_rate': '10',
  'profiles.country_code': "'FR'",
  'profiles.phone_country_code': "'+33'",
  'profiles.is_public': 'false',
  'artist_profiles.is_public': 'true',
  'manager_profiles.is_public': 'true',
  'fan_subscriptions.subscription_type': "'free'",
  'fan_subscriptions.is_active': 'true',
  'blogs.category': "'news'",
  'duels.status': "'upcoming'",
  'concerts.status': "'upcoming'",
  'artist_concerts.status': "'upcoming'",
  'artist_lives.status': "'live'",
};

/** Unique composite indexes not inferable from types.ts. */
const UNIQUE_INDEXES = {
  user_roles: [['user_id', 'role']],
  artist_followers: [['artist_id', 'follower_id']],
  comment_likes: [['comment_id', 'user_id']],
  replay_likes: [['replay_id', 'user_id']],
  referrals: [['referrer_id', 'referred_id']],
  competition_votes: [['competition_id', 'voter_id', 'candidate_id']],
};

/** Columns that are UNIQUE on their own. */
const UNIQUE_COLUMNS = {
  profiles: ['referral_code'],
};

/**
 * Foreign keys added in the migration (high-confidence only). Every column
 * listed maps to `{ table, column, onDelete }`; the FK is emitted only when the
 * target table exists in the parsed set. `users` is the auth table created by a
 * separate hand-written migration and is always assumed to exist.
 * Ownership columns cascade; reviewer/optional columns set null.
 */
const USER_FK = { table: 'users', column: 'id', onDelete: 'CASCADE' };
const USER_FK_NULL = { table: 'users', column: 'id', onDelete: 'SET NULL' };
const USER_OWNER_COLS = [
  'user_id', 'artist_id', 'follower_id', 'requester_id', 'opponent_id',
  'artist1_id', 'artist2_id', 'from_user_id', 'to_user_id', 'reporter_id',
  'reported_user_id', 'voter_id', 'referrer_id', 'referred_id', 'author_id',
  'host_id', 'sender_id', 'guest_id',
];
const USER_REVIEWER_COLS = [
  'reviewed_by', 'approved_by', 'processed_by', 'validated_by', 'acknowledged_by',
  'issued_by', 'created_by', 'manager_id', 'winner_id', 'admin_id', 'reviewer_id',
];

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses the Supabase types.ts and returns a descriptor per table.
 * @returns {Array<{ table: string, columns: Array<{ name: string, tsType: string, nullable: boolean, optional: boolean }> }>}
 */
function parseTypes() {
  const src = fs.readFileSync(TYPES_PATH, 'utf8');
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => /^ {4}Tables: \{$/.test(l));
  const end = lines.findIndex((l) => /^ {4}Views: \{$/.test(l));
  const slice = lines.slice(start + 1, end === -1 ? undefined : end);

  const tables = [];
  let current = null;
  let section = null; // 'Row' | 'Insert' | other
  const insertOptional = new Map();

  for (const line of slice) {
    const tableMatch = /^ {6}([a-z0-9_]+): \{$/.exec(line);
    if (tableMatch) {
      current = { table: tableMatch[1], columns: [] };
      tables.push(current);
      section = null;
      insertOptional.set(current.table, new Set());
      continue;
    }
    if (!current) continue;
    if (/^ {8}Row: \{$/.test(line)) { section = 'Row'; continue; }
    if (/^ {8}Insert: \{$/.test(line)) { section = 'Insert'; continue; }
    if (/^ {8}Update: \{$/.test(line)) { section = 'Update'; continue; }
    if (/^ {8}Relationships: /.test(line)) { section = null; continue; }

    // Column line, 10-space indent: `          name: type` or `          name?: type`
    const col = /^ {10}([a-z0-9_]+)(\??): (.+?)$/.exec(line);
    if (!col) continue;
    const [, name, optionalMark, rawType] = col;
    if (section === 'Row') {
      const nullable = / \| null$/.test(rawType);
      const tsType = rawType.replace(/ \| null$/, '').trim();
      current.columns.push({ name, tsType, nullable, optional: false });
    } else if (section === 'Insert' && optionalMark === '?') {
      insertOptional.get(current.table).add(name);
    }
  }

  // Flag columns that are optional on Insert (⇒ have a DB default).
  for (const t of tables) {
    const opt = insertOptional.get(t.table);
    for (const c of t.columns) c.optional = opt.has(c.name);
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

const includesAny = (name, keywords) => keywords.some((k) => name.includes(k));

/**
 * Maps a parsed column to a Sequelize type token (e.g. `UUID`, `DECIMAL(18, 2)`).
 * @param {string} table
 * @param {{ name: string, tsType: string }} column
 * @returns {{ token: string, isUuid: boolean, isDate: boolean }}
 */
function mapType(table, column) {
  const { name, tsType } = column;

  if (tsType === 'Json') return { token: 'JSON', isUuid: false, isDate: false };
  if (tsType === 'boolean') return { token: 'BOOLEAN', isUuid: false, isDate: false };
  if (tsType === 'number') {
    const token = includesAny(name, DECIMAL_KEYWORDS) && !name.endsWith('_count') ? 'DECIMAL(18, 2)' : 'INTEGER';
    return { token, isUuid: false, isDate: false };
  }

  // string variants
  if (name === 'id') return { token: 'UUID', isUuid: true, isDate: false };
  const isRef = name.endsWith('_id') || name.endsWith('_by');
  if (isRef && !includesAny(name, NON_UUID_ID_KEYWORDS)) {
    return { token: 'UUID', isUuid: true, isDate: false };
  }
  if (name.endsWith('_at') || name.endsWith('_date') || name.endsWith('deadline') || name.endsWith('_until')) {
    return { token: 'DATE', isUuid: false, isDate: true };
  }
  if (name.endsWith('_url')) return { token: 'STRING(2048)', isUuid: false, isDate: false };
  if (includesAny(name, TEXT_KEYWORDS)) return { token: 'TEXT', isUuid: false, isDate: false };
  return { token: 'STRING', isUuid: false, isDate: false };
}

/**
 * Determines the default value expression (JS source) for a column, if any.
 * @param {string} table
 * @param {{ name: string, optional: boolean, tsType: string }} column
 * @param {{ token: string }} type
 * @returns {string|null} JS expression as string, or null for no default.
 */
function defaultFor(table, column, type) {
  const key = `${table}.${column.name}`;
  if (DEFAULT_OVERRIDES[key] !== undefined) return DEFAULT_OVERRIDES[key];
  if (!column.optional) return null;
  if (column.name === 'created_at' || column.name === 'updated_at') return 'NOW';
  if (type.token === 'BOOLEAN') return BOOLEAN_TRUE_DEFAULTS.has(column.name) ? 'true' : 'false';
  if (type.token === 'JSON') return 'JSON_EMPTY';
  if (type.token === 'INTEGER' || type.token.startsWith('DECIMAL')) return '0';
  return null;
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const NAME_OVERRIDES = { webrtc_signaling: 'WebrtcSignal' };

/**
 * Converts a snake_case table name to a singular PascalCase model name.
 * @param {string} table
 * @returns {string}
 */
function modelName(table) {
  if (NAME_OVERRIDES[table]) return NAME_OVERRIDES[table];
  const pascal = table
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  if (pascal.endsWith('ies')) return `${pascal.slice(0, -3)}y`;
  if (pascal.endsWith('ss') || pascal.endsWith('us') || pascal.endsWith('is')) return pascal;
  if (pascal.endsWith('s')) return pascal.slice(0, -1);
  return pascal;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Renders a single Sequelize model file.
 * @param {{ table: string, columns: any[] }} desc
 * @returns {string}
 */
function renderModel(desc) {
  const Name = modelName(desc.table);
  const pk = desc.columns.find((c) => c.name === 'id')
    ? 'id'
    : desc.columns.find((c) => c.name === 'user_id')
      ? 'user_id'
      : desc.columns[0].name;

  const attrLines = desc.columns.map((c) => {
    const type = mapType(desc.table, c);
    const parts = [`type: DataTypes.${type.token}`];
    if (c.name === pk) {
      parts.push('primaryKey: true');
      if (type.isUuid) parts.push('defaultValue: DataTypes.UUIDV4');
    }
    parts.push(`allowNull: ${c.nullable ? 'true' : 'false'}`);
    const def = defaultFor(desc.table, c, type);
    if (def !== null && c.name !== pk) {
      const rendered = def === 'NOW' ? 'DataTypes.NOW' : def === 'JSON_EMPTY' ? '{}' : def;
      parts.push(`defaultValue: ${rendered}`);
    }
    return `    ${c.name}: { ${parts.join(', ')} },`;
  });

  const paranoid = PARANOID_TABLES.has(desc.table);
  if (paranoid) {
    attrLines.push("    deleted_at: { type: DataTypes.DATE, allowNull: true },");
  }
  const options = paranoid
    ? `      tableName: '${desc.table}',
      timestamps: true,
      createdAt: false,
      updatedAt: false,
      deletedAt: 'deleted_at',
      paranoid: true,
      underscored: true,`
    : `      tableName: '${desc.table}',
      timestamps: false,
      underscored: true,`;

  return `import { DataTypes } from 'sequelize';

/**
 * @file Sequelize model for \`${desc.table}\`.
 * Generated from the frontend Supabase schema (types.ts) — do not edit by hand;
 * re-run \`npm run db:generate:schema\`. Associations live in models/associations.js.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {typeof import('sequelize').DataTypes} DataTypes
 * @returns {import('sequelize').ModelStatic<any>}
 */
export default function define${Name}(sequelize) {
  return sequelize.define(
    '${Name}',
    {
${attrLines.join('\n')}
    },
    {
${options}
    },
  );
}
`;
}

/**
 * Renders the models registry consumed by models/index.js.
 * @param {Array<{ table: string }>} tables
 * @returns {string}
 */
function renderRegistry(tables) {
  const imports = tables
    .map((t) => `import define${modelName(t.table)} from './${modelName(t.table)}.model.js';`)
    .join('\n');
  const entries = tables
    .map((t) => `  { name: '${modelName(t.table)}', define: define${modelName(t.table)} },`)
    .join('\n');
  return `${imports}

/**
 * Registry of generated table models. Consumed by \`src/models/index.js\`, which
 * instantiates each definer against the shared Sequelize instance.
 * @type {Array<{ name: string, define: (sequelize: import('sequelize').Sequelize) => import('sequelize').ModelStatic<any> }>}
 */
export const generatedModels = [
${entries}
];

export default generatedModels;
`;
}

/**
 * Builds the FK descriptor list for the migration from all parsed columns.
 * @param {Array<{ table: string, columns: any[] }>} tables
 * @param {Set<string>} tableSet
 * @returns {Array<{ table: string, column: string, ref: { table: string, column: string }, onDelete: string }>}
 */
function buildForeignKeys(tables, tableSet) {
  const fks = [];
  const SELF_PARENT = new Set(); // tables where parent_id references itself
  for (const t of tables) {
    for (const c of t.columns) {
      const n = c.name;
      if (n === 'id') continue;
      if (USER_OWNER_COLS.includes(n)) {
        fks.push({ table: t.table, column: n, ref: { table: USER_FK.table, column: USER_FK.column }, onDelete: USER_FK.onDelete });
      } else if (USER_REVIEWER_COLS.includes(n)) {
        fks.push({ table: t.table, column: n, ref: { table: USER_FK_NULL.table, column: USER_FK_NULL.column }, onDelete: USER_FK_NULL.onDelete });
      } else if (n === 'parent_id') {
        SELF_PARENT.add(t.table);
        fks.push({ table: t.table, column: n, ref: { table: t.table, column: 'id' }, onDelete: 'CASCADE' });
      } else if (n.endsWith('_id') && !includesAny(n, NON_UUID_ID_KEYWORDS)) {
        // Entity references: <entity>_id → pluralized table guess.
        const base = n.slice(0, -3);
        const candidates = [`${base}s`, base, `${base}es`];
        const target = candidates.find((cand) => tableSet.has(cand));
        if (target) {
          fks.push({ table: t.table, column: n, ref: { table: target, column: 'id' }, onDelete: c.nullable ? 'SET NULL' : 'CASCADE' });
        }
      }
    }
  }
  return fks;
}

/**
 * Renders the single init migration (createTable pass, then indexes + FKs).
 * @param {Array<{ table: string, columns: any[] }>} tables
 * @returns {string}
 */
function renderMigration(tables) {
  const tableSet = new Set(tables.map((t) => t.table));
  const fks = buildForeignKeys(tables, tableSet);

  const createBlocks = tables.map((desc) => {
    const pk = desc.columns.find((c) => c.name === 'id')
      ? 'id'
      : desc.columns.find((c) => c.name === 'user_id')
        ? 'user_id'
        : desc.columns[0].name;
    const cols = desc.columns.map((c) => {
      const type = mapType(desc.table, c);
      const parts = [`type: Sequelize.${type.token}`];
      if (c.name === pk) {
        parts.push('primaryKey: true');
        if (type.isUuid) parts.push("defaultValue: Sequelize.literal('(UUID())')");
      }
      parts.push(`allowNull: ${c.nullable ? 'true' : 'false'}`);
      const def = defaultFor(desc.table, c, type);
      // MySQL cannot take a literal default on JSON columns — skip (app/model provides {}).
      if (def !== null && def !== 'JSON_EMPTY' && c.name !== pk) {
        const rendered = def === 'NOW' ? "Sequelize.literal('CURRENT_TIMESTAMP')" : def;
        parts.push(`defaultValue: ${rendered}`);
      }
      return `        ${c.name}: { ${parts.join(', ')} },`;
    });
    return `      await queryInterface.createTable('${desc.table}', {\n${cols.join('\n')}\n      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' });`;
  });

  // Indexes: every UUID *_id/_by column + created_at, plus curated uniques.
  const indexBlocks = [];
  for (const desc of tables) {
    for (const c of desc.columns) {
      if (c.name === 'id') continue;
      const type = mapType(desc.table, c);
      if (type.isUuid || c.name === 'created_at') {
        indexBlocks.push(`      await queryInterface.addIndex('${desc.table}', ['${c.name}'], { transaction });`);
      }
    }
    for (const cols of UNIQUE_INDEXES[desc.table] || []) {
      indexBlocks.push(`      await queryInterface.addIndex('${desc.table}', [${cols.map((x) => `'${x}'`).join(', ')}], { unique: true, transaction });`);
    }
    for (const col of UNIQUE_COLUMNS[desc.table] || []) {
      indexBlocks.push(`      await queryInterface.addIndex('${desc.table}', ['${col}'], { unique: true, transaction });`);
    }
  }

  const fkBlocks = fks.map((fk, i) =>
    `      await queryInterface.addConstraint('${fk.table}', {\n` +
    `        fields: ['${fk.column}'],\n` +
    `        type: 'foreign key',\n` +
    `        name: 'fk_${fk.table}_${fk.column}_${i}',\n` +
    `        references: { table: '${fk.ref.table}', field: '${fk.ref.column}' },\n` +
    `        onDelete: '${fk.onDelete}',\n` +
    `        onUpdate: 'CASCADE',\n` +
    `        transaction,\n` +
    `      });`,
  );

  const dropBlocks = [...tables].reverse().map((t) => `      await queryInterface.dropTable('${t.table}', { transaction });`);

  return `/* eslint-disable */
'use strict';

/**
 * Init migration — creates every content table (${tables.length} tables) parsed from the
 * frontend Supabase schema, then adds indexes and high-confidence foreign keys.
 *
 * NOTE: the auth \`users\` table (and refresh_tokens/otp_codes/oauth_accounts) is
 * created by migration 0000-init-auth so that user-referencing FKs resolve.
 * Reversible: \`down\` drops all tables with FK checks disabled.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
${createBlocks.join('\n')}

      // --- Indexes ---
${indexBlocks.join('\n')}

      // --- Foreign keys (high-confidence) ---
${fkBlocks.join('\n')}

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    const transaction = await queryInterface.sequelize.transaction();
    try {
${dropBlocks.join('\n')}
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    } finally {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  },
};
`;
}

/**
 * Converts a snake_case fragment to camelCase (for association aliases).
 * @param {string} s
 * @returns {string}
 */
function camel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * Derives the belongsTo alias for a foreign-key column.
 * @param {string} column
 * @returns {string}
 */
function fkAlias(column) {
  if (column === 'user_id') return 'user';
  if (column === 'parent_id') return 'parent';
  const raw = column.endsWith('_id') ? column.slice(0, -3) : column; // keep `_by`
  return camel(raw);
}

/**
 * Renders `applyGeneratedAssociations(models)` — one `belongsTo` per FK, plus a
 * self `parent`/`replies` pair for threaded tables. Reverse `hasMany` relations
 * for the hot paths are declared in the hand-written models/associations.js.
 * @param {Array<{ table: string, columns: any[] }>} tables
 * @returns {string}
 */
function renderAssociations(tables) {
  const tableSet = new Set(tables.map((t) => t.table));
  const fks = buildForeignKeys(tables, tableSet);
  const lines = [];
  for (const fk of fks) {
    const SourceModel = modelName(fk.table);
    const TargetModel = fk.ref.table === 'users' ? 'User' : modelName(fk.ref.table);
    const alias = fkAlias(fk.column);
    lines.push(
      `  models.${SourceModel}.belongsTo(models.${TargetModel}, { as: '${alias}', foreignKey: '${fk.column}' });`,
    );
    if (fk.column === 'parent_id') {
      lines.push(
        `  models.${SourceModel}.hasMany(models.${SourceModel}, { as: 'replies', foreignKey: 'parent_id' });`,
      );
    }
  }
  return `/* eslint-disable */
/**
 * @file Generated model associations (one belongsTo per foreign key).
 * Do not edit by hand — re-run \`npm run db:generate:schema\`. Hand-authored
 * reverse relations (hasMany) live in models/associations.js.
 * @param {Record<string, import('sequelize').ModelStatic<any>>} models
 */
export function applyGeneratedAssociations(models) {
${lines.join('\n')}
}

export default applyGeneratedAssociations;
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const tables = parseTypes();
  console.log(`Parsed ${tables.length} tables from types.ts`);

  // Reviewer/optional FK columns get an `ON DELETE SET NULL` constraint, which
  // MySQL only allows on a NULLable column — force them nullable so the column
  // definition and the FK agree (e.g. `admin_logs.admin_id` for system actions).
  for (const t of tables) {
    for (const c of t.columns) {
      if (USER_REVIEWER_COLS.includes(c.name)) c.nullable = true;
    }
  }

  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });

  for (const desc of tables) {
    const file = path.join(MODELS_DIR, `${modelName(desc.table)}.model.js`);
    fs.writeFileSync(file, renderModel(desc));
  }
  fs.writeFileSync(path.join(MODELS_DIR, 'index.js'), renderRegistry(tables));
  fs.writeFileSync(path.join(MIGRATIONS_DIR, '0001-init-content-schema.cjs'), renderMigration(tables));
  fs.writeFileSync(path.resolve(MODELS_DIR, '..', 'associations.generated.js'), renderAssociations(tables));

  console.log(`Generated ${tables.length} models → ${path.relative(ROOT, MODELS_DIR)}`);
  console.log(`Generated migration → ${path.relative(ROOT, path.join(MIGRATIONS_DIR, '0001-init-content-schema.cjs'))}`);
}

main();
