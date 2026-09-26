import "server-only";
import OpenAI, { APIError } from "openai";

export const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 64;
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function safeErrorMessage(error: unknown) {
  if (error instanceof APIError) {
    if (error.status === 401 || error.code === "invalid_api_key") return "OpenAI rejected the configured API credential.";
    if (error.status === 429) return "OpenAI rate limits or account quota rejected the embedding request.";
    if (error.status === 404) return "The embedding model or endpoint was not found or is unavailable.";
    if (error.status === 400) return "OpenAI rejected the embedding request; check model access and request settings.";
    if (error.status >= 500) return "The OpenAI embedding service returned a server error.";
    return `OpenAI returned an HTTP error (${error.status}).`;
  }

  if (error instanceof Error && /connection|fetch|network/iu.test(error.name)) {
    return "Could not connect to the OpenAI API.";
  }
  return "The embedding request failed before a valid OpenAI response.";
}

function logEmbeddingFailure(error: unknown, model: string) {
  const apiError = error instanceof APIError ? error : undefined;
  console.error("[milo:embeddings] Request failed", JSON.stringify({
    model,
    status: apiError?.status ?? null,
    type: apiError?.type ?? (error instanceof Error ? error.name : "UnknownError"),
    code: apiError?.code ?? null,
    message: safeErrorMessage(error),
  }));
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  const baseURL = process.env.OPENAI_BASE_URL;
  const client = new OpenAI({
    timeout: 60_000,
    maxRetries: 0,
    ...(baseURL ? { baseURL } : {}),
  });
  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const input = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    let response;
    try {
      response = await client.embeddings.create({ model, input, dimensions: EMBEDDING_DIMENSIONS });
    } catch (error) {
      logEmbeddingFailure(error, model);
      throw error;
    }
    const batch = response.data.toSorted((left, right) => left.index - right.index);

    if (batch.some(item => item.embedding.length !== EMBEDDING_DIMENSIONS || item.embedding.some(value => !Number.isFinite(value)))) {
      throw new Error("Embedding response had an unexpected vector shape.");
    }
    embeddings.push(...batch.map(item => item.embedding));
  }

  if (embeddings.length !== texts.length) {
    throw new Error("Embedding response did not include every input.");
  }

  return embeddings;
}