/**
 * @file Minimal Joi → OpenAPI 3.1 schema converter (dependency-free).
 *
 * Works off Joi's public `schema.describe()` AST rather than internals, so it is
 * stable across Joi patch versions. Covers the subset of Joi used by this API's
 * validation schemas: object/string/number/boolean/array/date, `valid()` enums,
 * `required`, `allow(null)`, string formats (uuid/email/uri), and min/max/length
 * bounds. Unknown constructs degrade gracefully to an open schema.
 *
 * @module openapi/joiToSchema
 */

/** Extracts a named rule's first arg limit from a Joi describe node. */
function ruleArg(desc, name) {
  const rule = (desc.rules || []).find((r) => r.name === name);
  if (!rule) return undefined;
  return rule.args?.limit ?? rule.args?.value ?? undefined;
}

/** @param {object} desc Joi describe node @returns {boolean} */
function hasRule(desc, name) {
  return (desc.rules || []).some((r) => r.name === name);
}

/**
 * Converts a single Joi describe node into an OpenAPI schema object.
 * @param {object} desc - Output of `joiSchema.describe()` (or a nested node).
 * @returns {object} OpenAPI schema.
 */
export function describeToSchema(desc) {
  if (!desc || !desc.type) return {};
  const out = {};
  const flags = desc.flags || {};

  // Enums via `valid(...)` (Joi sets flags.only + allow list).
  const allow = (desc.allow || []).filter((v) => v !== null);
  const nullable = (desc.allow || []).includes(null);

  switch (desc.type) {
    case 'object': {
      out.type = 'object';
      out.properties = {};
      const required = [];
      for (const [key, child] of Object.entries(desc.keys || {})) {
        out.properties[key] = describeToSchema(child);
        if (child.flags?.presence === 'required') required.push(key);
      }
      if (required.length) out.required = required;
      if (desc.flags?.unknown) out.additionalProperties = true;
      break;
    }
    case 'array':
      out.type = 'array';
      out.items = desc.items?.[0] ? describeToSchema(desc.items[0]) : {};
      break;
    case 'number':
      out.type = hasRule(desc, 'integer') ? 'integer' : 'number';
      if (ruleArg(desc, 'min') !== undefined) out.minimum = ruleArg(desc, 'min');
      if (ruleArg(desc, 'max') !== undefined) out.maximum = ruleArg(desc, 'max');
      if (hasRule(desc, 'positive')) out.exclusiveMinimum = 0;
      break;
    case 'boolean':
      out.type = 'boolean';
      break;
    case 'date':
      out.type = 'string';
      out.format = 'date-time';
      break;
    case 'string':
    default:
      out.type = 'string';
      if (hasRule(desc, 'guid')) out.format = 'uuid';
      else if (hasRule(desc, 'email')) out.format = 'email';
      else if (hasRule(desc, 'uri')) out.format = 'uri';
      if (ruleArg(desc, 'min') !== undefined) out.minLength = ruleArg(desc, 'min');
      if (ruleArg(desc, 'max') !== undefined) out.maxLength = ruleArg(desc, 'max');
      if (ruleArg(desc, 'length') !== undefined) {
        out.minLength = ruleArg(desc, 'length');
        out.maxLength = ruleArg(desc, 'length');
      }
      break;
  }

  if (flags.only && allow.length) out.enum = allow;
  if (nullable) out.nullable = true;
  if (flags.default !== undefined && typeof flags.default !== 'function') out.default = flags.default;
  if (flags.description) out.description = flags.description;
  return out;
}

/**
 * Converts a Joi schema instance into an OpenAPI schema.
 * @param {import('joi').Schema} joiSchema
 * @returns {object}
 */
export function joiToSchema(joiSchema) {
  if (!joiSchema || typeof joiSchema.describe !== 'function') return {};
  return describeToSchema(joiSchema.describe());
}

/**
 * Converts a Joi object schema into an array of OpenAPI `parameters`.
 * @param {import('joi').Schema} joiSchema - A Joi object schema.
 * @param {'path'|'query'} location
 * @returns {object[]}
 */
export function joiToParameters(joiSchema, location) {
  if (!joiSchema || typeof joiSchema.describe !== 'function') return [];
  const desc = joiSchema.describe();
  if (desc.type !== 'object' || !desc.keys) return [];
  return Object.entries(desc.keys).map(([name, child]) => ({
    name,
    in: location,
    required: location === 'path' || child.flags?.presence === 'required',
    schema: describeToSchema(child),
  }));
}

export default { joiToSchema, joiToParameters, describeToSchema };
