import { QueryTypes } from 'sequelize';

import { db } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

import { getDisplayProfiles } from './user.service.js';

/**
 * @file Virtual gifts catalog & inventory service.
 *
 * Reads the gift catalog (`virtual_gifts`), a user's owned inventory
 * (`user_gifts`), and the top donor of an event (`gift_transactions`). Buying
 * and sending gifts are wallet operations (see wallet.service) because they
 * move credits; this service is read-only.
 *
 * @module services/gift.service
 */

/**
 * Returns the full gift catalog, cheapest first.
 * @returns {Promise<object[]>}
 */
export async function listGifts() {
  return db.VirtualGift.findAll({ order: [['price', 'ASC']], raw: true });
}

/**
 * Creates a virtual gift (admin). Replaces the frontend admin panel's former
 * `supabase.from('virtual_gifts').insert(...)`.
 * @param {{ name: string, price: number, image_url?: string|null }} input
 * @returns {Promise<object>}
 */
export async function createGift(input) {
  return db.VirtualGift.create({
    name: input.name,
    price: input.price,
    image_url: input.image_url ?? null,
  });
}

/**
 * Updates a virtual gift (admin).
 * @param {string} id
 * @param {{ name?: string, price?: number, image_url?: string|null }} patch
 * @returns {Promise<object>}
 * @throws {ApiError} 404 when the gift does not exist.
 */
export async function updateGift(id, patch) {
  const gift = await db.VirtualGift.findByPk(id);
  if (!gift) throw ApiError.notFound('NOT_FOUND');
  if (patch.name !== undefined) gift.name = patch.name;
  if (patch.price !== undefined) gift.price = patch.price;
  if (patch.image_url !== undefined) gift.image_url = patch.image_url;
  await gift.save();
  return gift;
}

/**
 * Deletes a virtual gift (admin).
 * @param {string} id
 * @returns {Promise<void>}
 * @throws {ApiError} 404 when the gift does not exist.
 */
export async function deleteGift(id) {
  const n = await db.VirtualGift.destroy({ where: { id } });
  if (!n) throw ApiError.notFound('NOT_FOUND');
}

/**
 * Returns a user's owned gifts joined with catalog details.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function getInventory(userId) {
  return db.sequelize.query(
    `SELECT ug.gift_id, ug.quantity, vg.name, vg.price, vg.image_url
       FROM user_gifts ug JOIN virtual_gifts vg ON vg.id = ug.gift_id
      WHERE ug.user_id = :uid AND ug.quantity > 0
      ORDER BY vg.price DESC`,
    { replacements: { uid: userId }, type: QueryTypes.SELECT },
  );
}

/**
 * Returns the top donor (by total gift value) for a duel or live.
 * Mirrors the frontend `get_top_donor` used by the TopDonorBubble.
 * @param {object} scope
 * @param {string} [scope.duelId]
 * @param {string} [scope.liveId]
 * @returns {Promise<{ userId: string, total: number, author: object } | null>}
 */
export async function getTopDonor({ duelId = null, liveId = null }) {
  const column = duelId ? 'duel_id' : 'live_id';
  const value = duelId || liveId;
  if (!value) return null;
  const rows = await db.sequelize.query(
    `SELECT gt.from_user_id AS userId, ROUND(SUM(vg.price), 2) AS total
       FROM gift_transactions gt JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.${column} = :val
      GROUP BY gt.from_user_id
      ORDER BY total DESC
      LIMIT 1`,
    { replacements: { val: value }, type: QueryTypes.SELECT },
  );
  if (!rows.length) return null;
  const [author] = await getDisplayProfiles([rows[0].userId]);
  return { userId: rows[0].userId, total: Number(rows[0].total), author: author || null };
}

export default { listGifts, getInventory, getTopDonor, createGift, updateGift, deleteGift };
