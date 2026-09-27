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
 * Returns the top donor (by total gift value — concert also folds in dedications,
 * the only concert-attributable spend before `gift_transactions.concert_id` existed
 * and still a legitimate form of donation) for a duel, live or concert.
 * Mirrors the frontend `TopDonorBubble` / `TopDonor` shape (`user_id`, `full_name`,
 * `avatar_url`, `total_amount`) — this endpoint previously returned `{ userId, total,
 * author }`, which never matched what the component reads, so the bubble/marquee
 * silently rendered nothing regardless of context.
 * @param {object} scope
 * @param {string} [scope.duelId]
 * @param {string} [scope.liveId]
 * @param {string} [scope.concertId]
 * @returns {Promise<{ user_id: string, full_name: string|null, avatar_url: string|null, total_amount: number, last_message: null } | null>}
 */
export async function getTopDonor({ duelId = null, liveId = null, concertId = null }) {
  let rows;
  if (concertId) {
    rows = await db.sequelize.query(
      `SELECT uid AS userId, ROUND(SUM(amt), 2) AS total FROM (
         SELECT gt.from_user_id AS uid, COALESCE(vg.price, 0) AS amt
           FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
          WHERE gt.concert_id = :val
         UNION ALL
         SELECT fan_id AS uid, price_credits AS amt FROM concert_dedications WHERE concert_id = :val
       ) x
       GROUP BY uid ORDER BY total DESC LIMIT 1`,
      { replacements: { val: concertId }, type: QueryTypes.SELECT },
    );
  } else {
    const column = duelId ? 'duel_id' : 'live_id';
    const value = duelId || liveId;
    if (!value) return null;
    rows = await db.sequelize.query(
      `SELECT gt.from_user_id AS userId, ROUND(SUM(vg.price), 2) AS total
         FROM gift_transactions gt JOIN virtual_gifts vg ON vg.id = gt.gift_id
        WHERE gt.${column} = :val
        GROUP BY gt.from_user_id
        ORDER BY total DESC
        LIMIT 1`,
      { replacements: { val: value }, type: QueryTypes.SELECT },
    );
  }
  if (!rows.length) return null;
  const [author] = await getDisplayProfiles([rows[0].userId]);
  return {
    user_id: rows[0].userId,
    full_name: author?.full_name ?? null,
    avatar_url: author?.avatar_url ?? null,
    total_amount: Number(rows[0].total),
    last_message: null,
  };
}

export default { listGifts, getInventory, getTopDonor, createGift, updateGift, deleteGift };
