import { z, ZodTypeAny } from "zod";

/**
 * A minimal Zod → JSON Schema converter tailored to the shapes we use
 * for tool input_schema with Anthropic. Supports: string, number, boolean,
 * array, object, enum, optional, nullable, and their descriptions.
 *
 * This avoids pulling in a full zod-to-json-schema dependency while covering
 * every schema we actually pass to Claude in this project.
 */

type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = (schema as unknown as { _def: { typeName?: string; description?: string } })._def;
  const typeName = def?.typeName;
  const description = def?.description;

  const withMeta = (s: JsonSchema): JsonSchema =>
    description ? { ...s, description } : s;

  switch (typeName) {
    case "ZodString": {
      const checks = (def as unknown as { checks?: Array<{ kind: string; value?: number }> }).checks ?? [];
      const out: JsonSchema = { type: "string" };
      for (const c of checks) {
        if (c.kind === "min" && typeof c.value === "number") out.minLength = c.value;
        if (c.kind === "max" && typeof c.value === "number") out.maxLength = c.value;
      }
      return withMeta(out);
    }
    case "ZodNumber":
      return withMeta({ type: "number" });
    case "ZodBoolean":
      return withMeta({ type: "boolean" });
    case "ZodLiteral": {
      const value = (def as unknown as { value: unknown }).value;
      return withMeta({ const: value });
    }
    case "ZodEnum": {
      const values = (def as unknown as { values: string[] }).values;
      return withMeta({ type: "string", enum: values });
    }
    case "ZodArray": {
      const inner = (def as unknown as { type: ZodTypeAny }).type;
      const minLen = (def as unknown as { minLength?: { value: number } }).minLength;
      const maxLen = (def as unknown as { maxLength?: { value: number } }).maxLength;
      const out: JsonSchema = { type: "array", items: zodToJsonSchema(inner) };
      if (minLen) out.minItems = minLen.value;
      if (maxLen) out.maxItems = maxLen.value;
      return withMeta(out);
    }
    case "ZodObject": {
      const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        const innerDef = (value as unknown as { _def: { typeName?: string } })._def;
        if (innerDef.typeName !== "ZodOptional" && innerDef.typeName !== "ZodDefault") {
          required.push(key);
        }
      }
      const out: JsonSchema = {
        type: "object",
        properties,
      };
      if (required.length) out.required = required;
      return withMeta(out);
    }
    case "ZodOptional": {
      const inner = (def as unknown as { innerType: ZodTypeAny }).innerType;
      return zodToJsonSchema(inner);
    }
    case "ZodNullable": {
      const inner = (def as unknown as { innerType: ZodTypeAny }).innerType;
      const innerSchema = zodToJsonSchema(inner);
      return { ...innerSchema, nullable: true };
    }
    case "ZodDefault": {
      const inner = (def as unknown as { innerType: ZodTypeAny }).innerType;
      return zodToJsonSchema(inner);
    }
    case "ZodUnion": {
      const opts = (def as unknown as { options: ZodTypeAny[] }).options;
      return { anyOf: opts.map(zodToJsonSchema) };
    }
    case "ZodRecord": {
      const valueType = (def as unknown as { valueType: ZodTypeAny }).valueType;
      return { type: "object", additionalProperties: zodToJsonSchema(valueType) };
    }
    default:
      // Fallback: accept anything. We never hit this for our schemas.
      return {};
  }
}

// Re-export z for convenience so consumers only import from one place.
export { z };
