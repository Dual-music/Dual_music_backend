import Joi from 'joi';

/**
 * @file Joi schemas for the withdrawals module.
 * @module validations/withdrawal.validation
 */

const uuid = Joi.string().uuid();
const pin = Joi.string().pattern(/^[0-9]{6}$/).message('PIN must be exactly 6 digits');
const amount = Joi.number().positive().precision(2);

export const idParam = { params: Joi.object({ id: uuid.required() }) };

export const setPin = {
  body: Joi.object({ newPin: pin.required(), currentPin: pin }),
};
export const verifyPin = { body: Joi.object({ pin: pin.required() }) };
export const confirmReset = {
  body: Joi.object({ otp: Joi.string().pattern(/^[0-9]{6}$/).required(), newPin: pin.required() }),
};

export const calcNet = { body: Joi.object({ amount: amount.required() }) };

export const requestWithdrawal = {
  body: Joi.object({
    amount: amount.required(),
    pin: pin.required(),
    payoutMethodId: uuid,
    provider: Joi.string().valid('cinetpay', 'moneroo').allow(null, ''),
  }),
};

export const listQuery = {
  query: Joi.object({
    status: Joi.string().valid('pending', 'approved', 'completed', 'rejected'),
    limit: Joi.number().integer().min(1).max(100),
    cursor: Joi.string(),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(100),
  }),
};

export const complete = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({ providerTxId: Joi.string().max(120).allow('', null) }),
};

const methodBase = {
  method: Joi.string().valid('mobile_money', 'bank', 'paypal'),
  label: Joi.string().max(120).allow('', null),
  account_holder: Joi.string().max(200).allow('', null),
  bank_name: Joi.string().max(200).allow('', null),
  iban: Joi.string().max(60).allow('', null),
  paypal_email: Joi.string().email().max(200).allow('', null),
  phone_number: Joi.string().max(40).allow('', null),
  mobile_operator: Joi.string().max(60).allow('', null),
  is_default: Joi.boolean(),
};

export const addMethod = { body: Joi.object({ ...methodBase, method: methodBase.method.required() }) };
export const updateMethod = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object(methodBase).min(1),
};

export default {
  idParam,
  setPin,
  verifyPin,
  confirmReset,
  calcNet,
  requestWithdrawal,
  listQuery,
  complete,
  addMethod,
  updateMethod,
};
